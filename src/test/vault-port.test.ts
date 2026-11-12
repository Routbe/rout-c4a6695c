// @vitest-environment node
/**
 * The vault port end to end over the real db/0221 SQL (PGlite, as rout_app),
 * plus the passkey-only step-up rule for vault reads.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allowedStepUpMethods, methodAcceptedFor, newStepUpJti, proofCoversAction } from "@/lib/auth/step-up-rules";
import { generateRecipientKeys, openEnvelope, sealEnvelope } from "@/lib/crypto-enclave/pqc-envelope";
import { stepUpProofId } from "@/lib/vault/step-up-proof-id";
import { parseOpaqueToken } from "@/lib/vault/token-boundary";
import { LocalPostgresVaultAdapter, VaultDeniedError, type VaultSqlExecutor } from "@/lib/vault/vault-port.server";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
let db: PGlite;

const exec: VaultSqlExecutor = async (userId, query, params) => {
  await db.query("select set_config('rout.current_user_id', $1, false)", [userId]);
  await db.exec("set role rout_app");
  try {
    return (await db.query<Record<string, unknown>>(query, [...params])).rows;
  } finally {
    await db.exec("reset role");
  }
};
const port = new LocalPostgresVaultAdapter(exec);
const server = generateRecipientKeys("server_vault");
const ctx = `rout.vault.v1|${ALICE}|iban`;
const sealIban = () =>
  sealEnvelope({ kind: "vtk", holder: "server_vault", recipientPublicKey: server.publicKey, plaintext: new TextEncoder().encode("NL91ABNA0417164300"), context: ctx });

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create extension pgcrypto; create role rout_app; create table public.users (id uuid primary key);
    insert into public.users values ('${ALICE}'), ('${BOB}');`);
  await db.exec(readFileSync(new URL("../../db/0221_vault_enclave_isolation.sql", import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => db?.close());

describe("vault port over the enclave functions", () => {
  it("stores an envelope and returns a database-minted vtk_ reference", async () => {
    const ref = await port.storeToken({ userId: ALICE }, "vtk", sealIban());
    expect(ref).toMatch(/^vtk_[0-9a-f]{64}$/);
  });

  it("returns the exact envelope only after a registered passkey step-up, once", async () => {
    const envelope = sealIban();
    const ref = await port.storeToken({ userId: ALICE }, "vtk", envelope);
    const proofId = stepUpProofId(newStepUpJti());
    await expect(port.retrieveToken({ userId: ALICE }, ref, { verified: true, proofId })).rejects.toThrow(VaultDeniedError);
    const fresh = stepUpProofId(newStepUpJti());
    await port.registerPasskeyStepUp({ userId: ALICE }, fresh);
    const got = await port.retrieveToken({ userId: ALICE }, ref, { verified: true, proofId: fresh });
    expect(got.kind).toBe("vtk");
    expect(Buffer.from(got.envelope).equals(Buffer.from(envelope))).toBe(true);
    const plain = openEnvelope({ envelope: got.envelope, expectedKind: "vtk", holder: "server_vault", secretKey: server.secretKey, context: ctx });
    expect(new TextDecoder().decode(plain)).toBe("NL91ABNA0417164300");
    await expect(port.retrieveToken({ userId: ALICE }, ref, { verified: true, proofId: fresh })).rejects.toThrow(VaultDeniedError);
  });

  it("never hands one member's envelope to another", async () => {
    const ref = await port.storeToken({ userId: ALICE }, "vtk", sealIban());
    const bobProof = stepUpProofId(newStepUpJti());
    await port.registerPasskeyStepUp({ userId: BOB }, bobProof);
    await expect(port.retrieveToken({ userId: BOB }, ref, { verified: true, proofId: bobProof })).rejects.toThrow(VaultDeniedError);
  });

  it("refuses plaintext, a malformed caller and a kind mismatch", async () => {
    await expect(port.storeToken({ userId: ALICE }, "vtk", new TextEncoder().encode("NL91ABNA0417164300"))).rejects.toThrow(VaultDeniedError);
    await expect(port.storeToken({ userId: "not-a-uuid" }, "vtk", sealIban())).rejects.toThrow(VaultDeniedError);
    const vtk = await port.storeToken({ userId: ALICE }, "vtk", sealIban());
    const proof = stepUpProofId(newStepUpJti());
    await port.registerPasskeyStepUp({ userId: ALICE }, proof);
    const forged = parseOpaqueToken(`sdm_${vtk.slice(4)}`, "sdm");
    await expect(port.retrieveToken({ userId: ALICE }, forged, { verified: true, proofId: proof })).rejects.toThrow(VaultDeniedError);
  });
});

describe("vault read step-up rule", () => {
  it("accepts only a passkey, and none without one enrolled", () => {
    expect(allowedStepUpMethods({ passkey: true, totp: true, sms: true, backup: true, password: true }, "vault_token_read")).toEqual(["passkey"]);
    expect(allowedStepUpMethods({ passkey: false, totp: true }, "vault_token_read")).toEqual([]);
    for (const m of ["totp", "email", "sms", "backup", "password"] as const) expect(methodAcceptedFor("vault_token_read", m)).toBe(false);
    expect(proofCoversAction({ method: "passkey", verifiedAtSec: 0, scope: "*", jti: newStepUpJti() }, "vault_token_read")).toBe(true);
    expect(proofCoversAction({ method: "totp", verifiedAtSec: 0, scope: "vault_token_read", jti: newStepUpJti() }, "vault_token_read")).toBe(false);
  });

  it("maps each 128-bit proof id to one uuid", () => {
    expect(stepUpProofId("AAAAAAAAAAAAAAAAAAAAAA")).toBe("00000000-0000-0000-0000-000000000000");
    expect(stepUpProofId("_____________________w")).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff");
    expect(() => stepUpProofId("short")).toThrow(TypeError);
  });
});
