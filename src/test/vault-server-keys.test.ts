// @vitest-environment node
/**
 * db/0222 server key ring + the server vault (vtk_/sdm_) end to end over the
 * real SQL in PGlite, executed as rout_app.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newStepUpJti } from "@/lib/auth/step-up-rules";
import { generateRecipientKeys } from "@/lib/crypto-enclave/pqc-envelope";
import { deriveVaultKek } from "@/lib/vault/server-kek";
import { openWithServerKey, sealServerToken } from "@/lib/vault/server-vault.server";
import { stepUpProofId } from "@/lib/vault/step-up-proof-id";
import { LocalPostgresVaultAdapter, VaultDeniedError, type VaultSqlExecutor } from "@/lib/vault/vault-port.server";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const KEK = "K".repeat(32) + "7x".repeat(32);
let db: PGlite;

const asApp: VaultSqlExecutor = async (userId, query, params) => {
  await db.query("select set_config('rout.current_user_id', $1, false)", [userId]);
  await db.exec("set role rout_app");
  try {
    return (await db.query<Record<string, unknown>>(query, [...params])).rows;
  } finally {
    await db.exec("reset role");
  }
};
const port = new LocalPostgresVaultAdapter(asApp);
const iban = () => new TextEncoder().encode("NL91ABNA0417164300");

async function retrieve(userId: string, ref: string) {
  const proofId = stepUpProofId(newStepUpJti());
  await port.registerPasskeyStepUp({ userId }, proofId);
  return port.retrieveToken({ userId }, ref as never, { verified: true, proofId });
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create extension pgcrypto; create role rout_app; create table public.users (id uuid primary key);
    insert into public.users values ('${ALICE}'), ('${BOB}');`);
  for (const f of ["0221_vault_enclave_isolation.sql", "0222_vault_server_keys.sql"]) {
    await db.exec(readFileSync(new URL(`../../db/${f}`, import.meta.url), "utf8"));
  }
}, 30_000);
afterAll(async () => db?.close());

describe("server vault with the Master KEK", () => {
  it("seals with a freshly registered server key and opens only with the KEK", async () => {
    const ref = await sealServerToken(ALICE, "vtk", "payout_iban", iban(), { port, kek: deriveVaultKek(KEK) });
    expect(ref).toMatch(/^vtk_[0-9a-f]{64}$/);
    const { envelope } = await retrieve(ALICE, ref);
    const plain = await openWithServerKey(ALICE, "vtk", "payout_iban", envelope, { port, kek: deriveVaultKek(KEK) });
    expect(new TextDecoder().decode(plain)).toBe("NL91ABNA0417164300");
    await expect(openWithServerKey(ALICE, "vtk", "payout_iban", envelope, { port, kek: deriveVaultKek("W".repeat(64)) })).rejects.toThrow(VaultDeniedError);
    await expect(openWithServerKey(ALICE, "vtk", "other_field", envelope, { port, kek: deriveVaultKek(KEK) })).rejects.toThrow(VaultDeniedError);
    await expect(openWithServerKey(BOB, "vtk", "payout_iban", envelope, { port, kek: deriveVaultKek(KEK) })).rejects.toThrow(VaultDeniedError);
  });

  it("keeps one active key: later seals reuse it, a second registration is refused", async () => {
    await sealServerToken(BOB, "sdm", "card_keys", iban(), { port, kek: deriveVaultKek(KEK) });
    const rows = await db.query<{ n: number }>("select count(*)::int as n from vault_enclave.server_keys");
    expect(rows.rows[0]?.n).toBe(1);
    const other = generateRecipientKeys("server_vault");
    const kek = deriveVaultKek(KEK);
    expect(await port.registerServerKey({ userId: BOB }, { kid: other.kid, publicKey: other.publicKey, wrappedSeed: kek.wrap(other.kid, other.secretKey), kekId: kek.kekId })).toBe(false);
  });

  it("stores only the wrapped seed, never the seed itself", async () => {
    const r = await db.query<{ wrap: Uint8Array }>("select wrapped_seed as wrap from vault_enclave.server_keys");
    const wrap = r.rows[0]?.wrap;
    expect(wrap?.length).toBe(80);
    expect(new TextDecoder().decode(wrap?.subarray(0, 4))).toBe("RVK1");
  });

  it("refuses to seal when the active key was not wrapped by this KEK (forged registration)", async () => {
    await expect(sealServerToken(ALICE, "vtk", "payout_iban", iban(), { port, kek: deriveVaultKek("W".repeat(64)) })).rejects.toThrow(VaultDeniedError);
  });
});

describe("db/0222 permissions and integrity", () => {
  it("gives rout_app no table rights on the key ring", async () => {
    await expect(asApp(ALICE, "select * from vault_enclave.server_keys", [])).rejects.toThrow(/permission denied/);
    await expect(asApp(ALICE, "delete from vault_enclave.server_keys", [])).rejects.toThrow(/permission denied/);
  });

  it("rejects a key whose id does not match its public key, and anonymous callers", async () => {
    const k = generateRecipientKeys("server_vault");
    const kek = deriveVaultKek(KEK);
    const forged = { kid: new Uint8Array(16).fill(1), publicKey: k.publicKey, wrappedSeed: kek.wrap(new Uint8Array(16).fill(1), k.secretKey), kekId: kek.kekId };
    await db.exec("update vault_enclave.server_keys set retired_at = now()"); // free the active slot (owner)
    expect(await port.registerServerKey({ userId: ALICE }, forged)).toBe(false);
    const rows = await asApp("not-a-user", "select vault_enclave.register_server_key('\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea) as ok", []);
    expect(rows[0]?.["ok"]).toBe(false);
  });

  it("keeps retired keys readable for old envelopes and never lets a row change twice or disappear", async () => {
    await expect(db.exec("update vault_enclave.server_keys set retired_at = now()")).rejects.toThrow(/retired once/);
    await expect(db.exec("delete from vault_enclave.server_keys")).rejects.toThrow(/append-only/);
    const kid = (await db.query<{ kid: Uint8Array }>("select kid from vault_enclave.server_keys")).rows[0]?.kid;
    expect(await port.serverKey({ userId: ALICE }, new Uint8Array(kid ?? []))).not.toBeNull();
  });

  it("logs registrations on the hash chain", async () => {
    const r = await db.query<{ ok: boolean; n: number }>(
      "select vault_enclave.verify_audit_chain() as ok, (select count(*)::int from vault_enclave.audit_logs where action = 'server_key_register') as n",
    );
    expect(r.rows[0]?.ok).toBe(true);
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(4);
  });
});
