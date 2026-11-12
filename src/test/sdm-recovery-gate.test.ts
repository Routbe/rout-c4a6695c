// @vitest-environment node
/**
 * db/0224 NFC card recovery gate end to end over the real SQL (PGlite, as
 * rout_app): enrolment, a live SUN tap, replay, and the 3-in-10-minutes lockout
 * per card and per account.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { cbc, cmac } from "@noble/ciphers/aes.js";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deriveVaultKek } from "@/lib/vault/server-kek";
import { enrollSdmCard, verifyRecoveryTap, type SdmCardSecrets } from "@/lib/vault/sdm-recovery.server";
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
const deps = () => ({ port, kek: deriveVaultKek(KEK) });
const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

function card(seed: number): SdmCardSecrets {
  return {
    uid: Uint8Array.from([0x04, seed, 0x22, 0x33, 0x44, 0x55, 0x66]),
    metaReadKey: new Uint8Array(16).fill(seed + 1),
    fileReadKey: new Uint8Array(16).fill(seed + 2),
    cardFactorSecret: new Uint8Array(32).fill(seed + 3),
  };
}

/** The bytes a real NTAG 424 DNA would put in its tap URL. */
function tap(c: SdmCardSecrets, counter: number) {
  const plain = new Uint8Array(16);
  plain[0] = 0xc7;
  plain.set(c.uid, 1);
  plain.set([counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff], 8);
  const picc = cbc(c.metaReadKey, new Uint8Array(16), { disablePadding: true }).encrypt(plain);
  const sv2 = Uint8Array.from([0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80, ...c.uid, ...plain.slice(8, 11)]);
  const full = cmac(new Uint8Array(0), cmac(sv2, c.fileReadKey));
  return { piccData: hex(picc), cmac: hex(Array.from({ length: 8 }, (_, i) => full[2 * i + 1] ?? 0)) };
}
const forged = (t: { piccData: string; cmac: string }) => ({ ...t, cmac: `${t.cmac.slice(0, 15)}${t.cmac.endsWith("0") ? "1" : "0"}` });

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create extension pgcrypto; create role rout_app; create table public.users (id uuid primary key);
    insert into public.users values ('${ALICE}'), ('${BOB}');`);
  for (const f of ["0221_vault_enclave_isolation.sql", "0222_vault_server_keys.sql", "0224_sdm_recovery_gate.sql"]) {
    await db.exec(readFileSync(new URL(`../../db/${f}`, import.meta.url), "utf8"));
  }
}, 30_000);
afterAll(async () => db?.close());
// Each test starts with a clean lockout window (owner-only cleanup).
beforeEach(async () => {
  await db.exec("delete from vault_enclave.sdm_recovery_attempts");
});

describe("card recovery gate", () => {
  it("releases the card factor only for a live tap, and never twice for the same tap", async () => {
    const c = card(0x10);
    const cardId = await enrollSdmCard(ALICE, c, deps());
    expect(cardId).toMatch(/^[0-9a-f-]{36}$/);
    const grant = await verifyRecoveryTap({ cardId, ...tap(c, 5) }, deps());
    expect(grant.ownerUserId).toBe(ALICE);
    expect(Array.from(grant.cardFactorSecret)).toEqual(Array.from(c.cardFactorSecret));
    await expect(verifyRecoveryTap({ cardId, ...tap(c, 5) }, deps())).rejects.toThrow(VaultDeniedError);
    await expect(verifyRecoveryTap({ cardId, ...tap(c, 4) }, deps())).rejects.toThrow(VaultDeniedError);
    expect((await verifyRecoveryTap({ cardId, ...tap(c, 6) }, deps())).ownerUserId).toBe(ALICE);
  });

  it("locks a card after 3 failed taps in 10 minutes, even for a valid tap, and reopens after the window", async () => {
    const c = card(0x20);
    const cardId = await enrollSdmCard(BOB, c, deps());
    for (let i = 0; i < 3; i++) await expect(verifyRecoveryTap({ cardId, ...forged(tap(c, 10 + i)) }, deps())).rejects.toThrow(VaultDeniedError);
    await expect(verifyRecoveryTap({ cardId, ...tap(c, 20) }, deps())).rejects.toThrow(VaultDeniedError);
    const locked = await db.query<{ reason: string }>("select reason from vault_enclave.audit_logs order by seq desc limit 1");
    expect(locked.rows[0]?.reason).toBe("card_locked");
    await db.exec("update vault_enclave.sdm_recovery_attempts set started_at = started_at - interval '11 minutes'");
    expect((await verifyRecoveryTap({ cardId, ...tap(c, 21) }, deps())).ownerUserId).toBe(BOB);
  });

  it("locks the whole account when failures are spread over its cards", async () => {
    const a = card(0x30);
    const b = card(0x40);
    const cardA = await enrollSdmCard(ALICE, a, deps());
    const cardB = await enrollSdmCard(ALICE, b, deps());
    await expect(verifyRecoveryTap({ cardId: cardA, ...forged(tap(a, 1)) }, deps())).rejects.toThrow(VaultDeniedError);
    await expect(verifyRecoveryTap({ cardId: cardA, ...forged(tap(a, 2)) }, deps())).rejects.toThrow(VaultDeniedError);
    await expect(verifyRecoveryTap({ cardId: cardB, ...forged(tap(b, 1)) }, deps())).rejects.toThrow(VaultDeniedError);
    await expect(verifyRecoveryTap({ cardId: cardB, ...tap(b, 2) }, deps())).rejects.toThrow(VaultDeniedError);
    const r = await db.query<{ reason: string }>("select reason from vault_enclave.audit_logs order by seq desc limit 1");
    expect(r.rows[0]?.reason).toBe("account_locked");
  });

  it("counts unconfirmed attempts as failures and accepts a verdict only once, for the same tap, within 60 s", async () => {
    const c = card(0x50);
    const cardId = await enrollSdmCard(BOB, c, deps());
    const t = tap(c, 7);
    const bytes = { piccData: Uint8Array.from(Buffer.from(t.piccData, "hex")), cmac: Uint8Array.from(Buffer.from(t.cmac, "hex")) };
    const other = { piccData: bytes.piccData, cmac: new Uint8Array(8) };
    const first = await port.beginSdmRecovery(cardId, bytes);
    expect(await port.confirmSdmRecovery(first.attemptId, other, true, 7)).toBe(false);
    expect(await port.confirmSdmRecovery(first.attemptId, bytes, true, 7)).toBe(false);
    const second = await port.beginSdmRecovery(cardId, bytes);
    await db.query("update vault_enclave.sdm_recovery_attempts set started_at = started_at - interval '61 seconds' where attempt_id = $1", [second.attemptId]);
    expect(await port.confirmSdmRecovery(second.attemptId, bytes, true, 7)).toBe(false);
    await port.beginSdmRecovery(cardId, bytes); // never confirmed: third failure
    await expect(port.beginSdmRecovery(cardId, bytes)).rejects.toThrow(VaultDeniedError);
  });

  it("refuses malformed input, unknown cards and revoked cards without releasing anything", async () => {
    const c = card(0x60);
    const cardId = await enrollSdmCard(ALICE, c, deps());
    await expect(verifyRecoveryTap({ cardId, piccData: "zz", cmac: "00" }, deps())).rejects.toThrow(VaultDeniedError);
    await expect(verifyRecoveryTap({ cardId: "00000000-0000-4000-8000-0000000000ff", ...tap(c, 1) }, deps())).rejects.toThrow(VaultDeniedError);
    await expect(port.beginSdmRecovery(cardId, { piccData: new Uint8Array(3), cmac: new Uint8Array(8) })).rejects.toThrow(VaultDeniedError);
    await db.query("update vault_enclave.sdm_cards set revoked_at = now() where card_id = $1", [cardId]);
    await expect(verifyRecoveryTap({ cardId, ...tap(c, 2) }, deps())).rejects.toThrow(VaultDeniedError);
  });
});

describe("db/0224 permissions", () => {
  it("gives rout_app no table rights and lets only the owner link their own sdm_ envelope", async () => {
    for (const t of ["sdm_cards", "sdm_recovery_attempts"]) {
      await expect(asApp(ALICE, `select * from vault_enclave.${t}`, [])).rejects.toThrow(/permission denied/);
    }
    await expect(asApp(ALICE, "select * from vault_enclave.sdm_failures(gen_random_uuid(), gen_random_uuid(), now())", [])).rejects.toThrow(/permission denied/);
    const ref = (await db.query<{ ref: string }>(`select token_ref as ref from vault_enclave.opaque_tokens where owner_user_id = '${ALICE}' and token_type = 'sdm' limit 1`)).rows[0]?.ref ?? "";
    const asBob = await asApp(BOB, "select vault_enclave.register_sdm_card($1) as id", [ref]);
    expect(asBob[0]?.["id"]).toBeNull();
    const anon = await asApp("", "select vault_enclave.register_sdm_card($1) as id", [ref]);
    expect(anon[0]?.["id"]).toBeNull();
    const again = await asApp(ALICE, "select vault_enclave.register_sdm_card($1) as id", [ref]);
    expect(again[0]?.["id"]).toBeNull();
  });

  it("keeps every gate decision on the intact hash chain", async () => {
    const r = await db.query<{ ok: boolean; n: number }>(
      "select vault_enclave.verify_audit_chain() as ok, (select count(*)::int from vault_enclave.audit_logs where action like 'sdm_%') as n",
    );
    expect(r.rows[0]?.ok).toBe(true);
    expect(r.rows[0]?.n).toBeGreaterThan(20);
  });
});
