// @vitest-environment node
/**
 * db/0221 on an in-process Postgres: rout_app reaches the vault only through
 * the three SECURITY DEFINER functions, retrieval needs a fresh, single-use
 * passkey proof of the same member, and the audit chain is append-only.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const PROOF_1 = "11111111-1111-4111-8111-111111111111";
const PROOF_2 = "22222222-2222-4222-8222-222222222222";
const PROOF_3 = "33333333-3333-4333-8333-333333333333";
const PROOF_BOB = "44444444-4444-4444-8444-444444444444";

/** 'RVE1' + 1596 bytes = smallest accepted envelope. */
const ENVELOPE = new Uint8Array(1600).fill(0xab);
ENVELOPE.set([0x52, 0x56, 0x45, 0x31]);
const PLAINTEXT_IBAN = new TextEncoder().encode("NL91ABNA0417164300");

let db: PGlite;

async function as(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('rout.current_user_id', $1, false)", [user ?? ""]);
  await db.exec("set role rout_app");
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
const store = async (user: string | null, type: string, payload: Uint8Array) =>
  (await as(user, "select vault_enclave.store_opaque_token($1, $2) as ref", [type, payload])).rows[0]?.["ref"] as string | null;
const register = async (user: string, proof: string, method = "passkey") =>
  (await as(user, "select vault_enclave.register_step_up_proof($1::uuid, $2) as ok", [proof, method])).rows[0]?.["ok"];
const retrieve = async (user: string, ref: string, verified: boolean | null, proof: string | null) =>
  (await as(user, "select * from vault_enclave.retrieve_opaque_token($1, $2, $3::uuid)", [ref, verified, proof])).rows[0] as {
    granted: boolean;
    token_type: string | null;
    encrypted_payload: Uint8Array | null;
  };
const lastReason = async () =>
  (await db.query<{ reason: string }>("select reason from vault_enclave.audit_logs order by seq desc limit 1")).rows[0]?.reason;

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create extension pgcrypto;
    create role rout_app;
    create table public.users (id uuid primary key);
    insert into public.users values ('${ALICE}'), ('${BOB}');`);
  await db.exec(readFileSync(new URL("../../db/0221_vault_enclave_isolation.sql", import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => db?.close());

describe("vault enclave (db/0221)", () => {
  let ref = "";

  it("gives rout_app no direct access to any vault table", async () => {
    for (const t of ["opaque_tokens", "step_up_proofs", "audit_logs"]) {
      await expect(as(ALICE, `select * from vault_enclave.${t}`)).rejects.toThrow(/permission denied/);
    }
    await expect(as(ALICE, `insert into vault_enclave.step_up_proofs values ('${PROOF_1}', '${ALICE}', 'passkey', now())`)).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, "select vault_enclave.verify_audit_chain()")).rejects.toThrow(/permission denied/);
  });

  it("stores only sealed envelopes and mints the reference itself", async () => {
    expect(await store(ALICE, "vtk", PLAINTEXT_IBAN)).toBeNull();
    expect(await lastReason()).toBe("not_an_envelope");
    expect(await store(ALICE, "xyz", ENVELOPE)).toBeNull();
    expect(await store(null, "vtk", ENVELOPE)).toBeNull();
    expect(await lastReason()).toBe("no_caller");
    ref = (await store(ALICE, "vtk", ENVELOPE)) ?? "";
    expect(ref).toMatch(/^vtk_[0-9a-f]{64}$/);
  });

  it("refuses retrieval without p_step_up_verified = true", async () => {
    expect((await retrieve(ALICE, ref, false, null)).granted).toBe(false);
    expect((await retrieve(ALICE, ref, null, null)).granted).toBe(false);
    expect(await lastReason()).toBe("step_up_missing");
  });

  it("refuses a 'verified' flag without a registered passkey proof", async () => {
    const r = await retrieve(ALICE, ref, true, PROOF_1);
    expect(r).toEqual({ granted: false, token_type: null, encrypted_payload: null });
    expect(await lastReason()).toBe("proof_unknown");
  });

  it("accepts only passkey proofs, each id once", async () => {
    expect(await register(ALICE, PROOF_1, "totp")).toBe(false);
    expect(await lastReason()).toBe("method_not_passkey");
    expect(await register(ALICE, PROOF_1)).toBe(true);
    expect(await register(ALICE, PROOF_1)).toBe(false);
  });

  it("returns the envelope once per proof to its owner", async () => {
    const ok = await retrieve(ALICE, ref, true, PROOF_1);
    expect(ok.granted).toBe(true);
    expect(ok.token_type).toBe("vtk");
    expect(ok.encrypted_payload?.length).toBe(1600);
    expect((await retrieve(ALICE, ref, true, PROOF_1)).granted).toBe(false);
    expect(await lastReason()).toBe("proof_replayed");
  });

  it("never serves another member's token, and spends the proof anyway", async () => {
    expect(await register(BOB, PROOF_BOB)).toBe(true);
    expect((await retrieve(BOB, ref, true, PROOF_BOB)).granted).toBe(false);
    expect(await lastReason()).toBe("not_found");
    expect((await retrieve(ALICE, ref, true, PROOF_BOB)).granted).toBe(false);
    expect(await lastReason()).toBe("proof_unknown");
  });

  it("rejects proofs older than 300 seconds on the database clock", async () => {
    expect(await register(ALICE, PROOF_2)).toBe(true);
    await db.query("update vault_enclave.step_up_proofs set verified_at = clock_timestamp() - interval '301 seconds' where proof_id = $1", [PROOF_2]);
    expect((await retrieve(ALICE, ref, true, PROOF_2)).granted).toBe(false);
    expect(await lastReason()).toBe("proof_expired");
    expect(await register(ALICE, PROOF_3)).toBe(true);
    await db.query("update vault_enclave.step_up_proofs set verified_at = clock_timestamp() - interval '290 seconds' where proof_id = $1", [PROOF_3]);
    expect((await retrieve(ALICE, ref, true, PROOF_3)).granted).toBe(true);
  });

  it("keeps an append-only, verifiable audit chain of every call", async () => {
    const rows = (await db.query<{ n: number }>("select count(*)::int as n from vault_enclave.audit_logs")).rows[0]?.n ?? 0;
    expect(rows).toBeGreaterThanOrEqual(18);
    expect((await db.query<{ ok: boolean }>("select vault_enclave.verify_audit_chain() as ok")).rows[0]?.ok).toBe(true);
    // Even the owner cannot rewrite or remove history through normal statements.
    await expect(db.query("update vault_enclave.audit_logs set reason = 'ok'")).rejects.toThrow(/vault_audit_immutable/);
    await expect(db.query("delete from vault_enclave.audit_logs")).rejects.toThrow(/vault_audit_immutable/);
    await expect(db.query("truncate vault_enclave.audit_logs")).rejects.toThrow(/vault_audit_immutable/);
    // A tamper that bypasses the trigger is caught by the chain.
    await db.exec(`alter table vault_enclave.audit_logs disable trigger audit_logs_no_update;
      update vault_enclave.audit_logs set reason = 'ok' where seq = 3;
      alter table vault_enclave.audit_logs enable trigger audit_logs_no_update;`);
    expect((await db.query<{ ok: boolean }>("select vault_enclave.verify_audit_chain() as ok")).rows[0]?.ok).toBe(false);
  });
});
