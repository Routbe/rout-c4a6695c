// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("enforces atomic nonce consumption, expiry, immutable logs and hardware kill-switch in PostgreSQL", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`create extension pgcrypto;
      create role rout_app;
      create table public.users(id uuid primary key);
      create function public.rout_current_user_id() returns uuid language sql as $$ select null::uuid $$;`);
    for (const file of ["0198_card_freezes.sql", "0199_card_hardware_cmf.sql", "0200_factory_card_pairing.sql", "0201_card_security_hardening.sql"]) {
      await db.exec(readFileSync(`db/${file}`, "utf8"));
    }
    const nonce = "A".repeat(22);
    const consume = async () => (await db.query<{ ok: boolean }>("select public.rout_card_token_use($1, now() + interval '60 seconds') as ok", [nonce])).rows[0]?.ok;
    expect(await consume()).toBe(true);
    expect(await consume()).toBe(false);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.used_nonces")).rows[0]?.n).toBe(1);
    expect((await db.query<{ event: string }>("select event from public.audit_logs order by id")).rows.map((row) => row.event)).toEqual(["qr_verified", "qr_replayed"]);
    expect((await db.query<{ ok: boolean }>("select public.rout_card_token_use($1, now() - interval '1 second') as ok", ["B".repeat(22)])).rows[0]?.ok).toBe(false);
    expect((await db.query<{ ok: boolean }>("select public.rout_card_token_use($1, now() + interval '61 seconds') as ok", ["C".repeat(22)])).rows[0]?.ok).toBe(false);
    await db.exec(`insert into public.physical_keys(hardware_id, user_id, card_serial, public_key, key_alg, status)
      values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','profile-test-card',repeat('A',43),'Ed25519','pending');`);
    const challenge = async () => (await db.query<{ ok: boolean }>("select public.rout_hw_issue_challenge($1::uuid, $2) as ok", ["11111111-1111-4111-8111-111111111111", "a".repeat(64)])).rows[0]?.ok;
    expect(await challenge()).toBe(false);
    await db.exec("update public.physical_keys set status='active'");
    expect(await challenge()).toBe(true);
    await db.exec("update public.physical_keys set status='revoked'");
    expect((await db.query("select * from public.rout_hw_consume_challenge($1::uuid, $2)", ["11111111-1111-4111-8111-111111111111", "a".repeat(64)])).rows).toEqual([]);
    expect((await db.query<{ s: string }>("select public.rout_card_status_by_serial('profile-test-card') as s")).rows[0]?.s).toBe("frozen");
    await db.exec("set role rout_app");
    await expect(db.exec("delete from public.audit_logs")).rejects.toThrow(/permission denied/);
  } finally { await db.close(); }
}, 60000);