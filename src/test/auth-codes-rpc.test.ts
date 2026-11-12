// @vitest-environment node
/**
 * db/0226 over the real SQL (PGlite, as rout_app): sign-in and 2FA code tables
 * are closed; only the database functions issue and redeem codes, with expiry,
 * 5 tries, single use and issue caps enforced in the database.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const b64 = (v: string) => createHash("sha256").update(v).digest("base64");
const hex = (v: string) => createHash("sha256").update(v).digest("hex");
const ENC = "x".repeat(40);
let db: PGlite;

type Row = Record<string, unknown>;
async function asApp(user: string | null, query: string, params: unknown[] = []): Promise<Row[]> {
  await db.query("select set_config('rout.current_user_id', $1, false), set_config('rout.purge_user_id', '', false)", [user ?? ""]);
  await db.exec("set role rout_app");
  try {
    return (await db.query<Row>(query, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}
const issue = (user: string | null, forUser: string, code: string, purpose = "step_up") =>
  asApp(user, "select public.rout_security_code_issue($1::uuid, $2, $3, 10) as s", [forUser, purpose, b64(`${forUser}:${purpose}:${code}`)]).then((r) => r[0]?.["s"]);
const consume = (user: string, code: string, purpose = "step_up") =>
  asApp(user, "select public.rout_security_code_consume($1::uuid, $2, $3) as ok", [user, purpose, b64(`${user}:${purpose}:${code}`)]).then((r) => r[0]?.["ok"]);
const phoneIssue = (user: string, phone: string, code: string) =>
  asApp(user, "select public.rout_phone_code_issue($1::uuid, $2, $3, $4, $5, now() + interval '10 minutes') as s",
    [user, hex(phone), ENC, phone.slice(-4), hex(`${user}:${code}`)]).then((r) => r[0]?.["s"]);
const phoneVerify = (user: string, code: string) =>
  asApp(user, "select status, last4 from public.rout_phone_code_verify($1::uuid, $2)", [user, hex(`${user}:${code}`)]).then((r) => r[0]);

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create role rout_app;
    create function public.rout_current_user_id() returns uuid language sql stable
      as $$ select nullif(current_setting('rout.current_user_id', true), '')::uuid $$;
    create table public.account_deletions (user_id uuid primary key, cancelled_at timestamptz, completed_at timestamptz, purge_after timestamptz not null);
    create table public.user_roles (user_id uuid not null, role text not null);
    create table public.security_codes (id uuid primary key default gen_random_uuid(), user_id uuid not null, purpose text not null,
      code_hash text not null, attempts integer not null default 0, expires_at timestamptz not null, consumed_at timestamptz,
      created_at timestamptz not null default now());
    create table public.phone_otp_codes (id uuid primary key default gen_random_uuid(), user_id uuid not null, phone_hash text not null,
      phone_number_enc text not null, phone_last4 text not null, code_hash text not null, attempts integer not null default 0,
      expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now());
    create table public.auth_tokens (id uuid primary key default gen_random_uuid(), user_id uuid not null, purpose text not null,
      token_hash text not null unique, payload jsonb not null default '{}', expires_at timestamptz not null, consumed_at timestamptz,
      created_at timestamptz not null default now());
    create table public.user_phone_numbers (user_id uuid primary key, phone_number_enc text not null, phone_hash text not null,
      phone_last4 text not null, phone_verified boolean not null default false, phone_verified_at timestamptz, updated_at timestamptz not null default now());
    insert into public.user_roles values ('${ADMIN}', 'admin');`);
  for (const t of ["security_codes", "phone_otp_codes", "auth_tokens"]) {
    await db.exec(`grant select, insert, update, delete on public.${t} to rout_app; alter table public.${t} enable row level security;
      create policy rout_server on public.${t} to rout_app using (true) with check (true);`);
  }
  // 0223 brings rout_purge_due; its other statements need tables this fixture leaves out.
  const purgeDue = readFileSync(new URL("../../db/0223_revoke_legacy_rls.sql", import.meta.url), "utf8")
    .match(/create or replace function public\.rout_purge_due[\s\S]*?grant execute on function public\.rout_purge_due\(uuid\) to rout_app;/)?.[0];
  if (!purgeDue) throw new Error("rout_purge_due not found in 0223");
  await db.exec(purgeDue);
  await db.exec(readFileSync(new URL("../../db/0226_auth_codes_rpc.sql", import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec("delete from public.security_codes; delete from public.phone_otp_codes; delete from public.user_phone_numbers; delete from public.account_deletions;");
});

describe("db/0226 tables are closed to the app", () => {
  it("refuses every direct read or write on the three code tables", async () => {
    for (const t of ["security_codes", "phone_otp_codes", "auth_tokens"]) {
      await expect(asApp(ALICE, `select * from public.${t}`)).rejects.toThrow(/permission denied/);
      await expect(asApp(ALICE, `delete from public.${t}`)).rejects.toThrow(/permission denied/);
    }
  });
});

describe("security codes", () => {
  it("redeems a correct code exactly once", async () => {
    expect(await issue(ALICE, ALICE, "123456")).toBe("ok");
    expect(await consume(ALICE, "123456")).toBe(true);
    expect(await consume(ALICE, "123456")).toBe(false);
  });

  it("locks the code after 5 wrong tries, even for the right code", async () => {
    await issue(ALICE, ALICE, "123456");
    for (let i = 0; i < 5; i++) expect(await consume(ALICE, "000000")).toBe(false);
    expect(await consume(ALICE, "123456")).toBe(false);
  });

  it("refuses an expired code", async () => {
    await issue(ALICE, ALICE, "123456");
    await db.exec("update public.security_codes set expires_at = now() - interval '1 second'");
    expect(await consume(ALICE, "123456")).toBe(false);
  });

  it("only a new code works once another is issued", async () => {
    await issue(ALICE, ALICE, "111111");
    await issue(ALICE, ALICE, "222222");
    expect(await consume(ALICE, "111111")).toBe(false);
    expect(await consume(ALICE, "222222")).toBe(true);
  });

  it("never issues or redeems for a member other than the one in the request", async () => {
    expect(await issue(ALICE, BOB, "123456")).toBe("no_context");
    expect(await issue(null, ALICE, "123456")).toBe("no_context");
    await issue(BOB, BOB, "123456");
    const forged = await asApp(ALICE, "select public.rout_security_code_consume($1::uuid, 'step_up', $2) as ok", [BOB, b64(`${BOB}:step_up:123456`)]);
    expect(forged[0]?.["ok"]).toBe(false);
    expect(await consume(BOB, "123456")).toBe(true);
  });

  it("allows at most 5 codes per purpose in 15 minutes", async () => {
    for (let i = 0; i < 5; i++) expect(await issue(ALICE, ALICE, `10000${i}`)).toBe("ok");
    expect(await issue(ALICE, ALICE, "100009")).toBe("rate_limited");
    expect(await issue(ALICE, ALICE, "100009", "two_factor")).toBe("ok");
  });

  it("rejects unknown purposes and malformed digests", async () => {
    expect(await issue(ALICE, ALICE, "123456", "anything")).toBe("invalid");
    const bad = await asApp(ALICE, "select public.rout_security_code_issue($1::uuid, 'step_up', 'not-a-digest', 10) as s", [ALICE]);
    expect(bad[0]?.["s"]).toBe("invalid");
  });
});

describe("phone codes", () => {
  it("verifies the number with the right code, once", async () => {
    expect(await phoneIssue(ALICE, "+32470000001", "123456")).toBe("ok");
    expect(await phoneVerify(ALICE, "123456")).toEqual({ status: "verified", last4: "0001" });
    expect((await db.query("select phone_verified from public.user_phone_numbers where user_id = $1", [ALICE])).rows).toEqual([{ phone_verified: true }]);
    expect((await phoneVerify(ALICE, "123456"))?.["status"]).toBe("no_code");
  });

  it("stops after 5 wrong tries", async () => {
    await phoneIssue(ALICE, "+32470000002", "123456");
    for (let i = 0; i < 5; i++) expect((await phoneVerify(ALICE, "000000"))?.["status"]).toBe("invalid");
    expect((await phoneVerify(ALICE, "123456"))?.["status"]).toBe("too_many_attempts");
  });

  it("allows 3 codes per number and 5 per member per hour", async () => {
    for (let i = 0; i < 3; i++) expect(await phoneIssue(ALICE, "+32470000003", "123456")).toBe("ok");
    expect(await phoneIssue(ALICE, "+32470000003", "123456")).toBe("rate_limited");
    expect(await phoneIssue(ALICE, "+32470000004", "123456")).toBe("ok");
    expect(await phoneIssue(ALICE, "+32470000005", "123456")).toBe("ok");
    expect(await phoneIssue(ALICE, "+32470000006", "123456")).toBe("rate_limited");
  });

  it("confirms an inbound code only from the same number, counting wrong codes", async () => {
    await phoneIssue(BOB, "+447700900001", "654321");
    expect(await asApp(null, "select * from public.rout_phone_inbound_candidate($1)", [hex("+447700900099")])).toEqual([]);
    const [c] = await asApp(null, "select code_id, user_id from public.rout_phone_inbound_candidate($1)", [hex("+447700900001")]);
    expect(c?.["user_id"]).toBe(BOB);
    const confirm = (code: string) => asApp(null, "select public.rout_phone_inbound_confirm($1::uuid, $2, $3) as ok",
      [c?.["code_id"], hex("+447700900001"), hex(`${BOB}:${code}`)]).then((r) => r[0]?.["ok"]);
    expect(await confirm("000000")).toBe(false);
    expect((await db.query("select attempts from public.phone_otp_codes")).rows).toEqual([{ attempts: 1 }]);
    expect(await confirm("654321")).toBe(true);
    expect(await confirm("654321")).toBe(false);
  });

  it("opens the manual queue only to admins", async () => {
    await phoneIssue(BOB, "+447700900002", "654321");
    await expect(asApp(ALICE, "select * from public.rout_phone_pending_list(50)")).rejects.toThrow(/forbidden/);
    await expect(asApp(ALICE, "select public.rout_phone_admin_approve(gen_random_uuid())")).rejects.toThrow(/forbidden/);
    const queue = await asApp(ADMIN, "select id, phone_last4 from public.rout_phone_pending_list(50)");
    expect(queue.map((r) => r["phone_last4"])).toEqual(["0002"]);
    expect((await asApp(ADMIN, "select public.rout_phone_admin_approve($1::uuid) as ok", [queue[0]?.["id"]]))[0]?.["ok"]).toBe(true);
  });
});

describe("clearing codes", () => {
  it("lets the account purge clear codes only when the deletion is due", async () => {
    await issue(ALICE, ALICE, "123456");
    const purge = async () => {
      await db.query("select set_config('rout.current_user_id', '', false), set_config('rout.purge_user_id', $1, false)", [ALICE]);
      await db.exec("set role rout_app");
      try {
        await db.query("select public.rout_auth_secrets_purge($1::uuid)", [ALICE]);
      } finally {
        await db.exec("reset role");
      }
    };
    await expect(purge()).rejects.toThrow(/purge_not_due/);
    await db.query("insert into public.account_deletions values ($1, null, null, now() - interval '1 minute')", [ALICE]);
    await purge();
    expect((await db.query("select * from public.security_codes")).rows).toHaveLength(0);
  });

  it("clears only the requesting member's own codes", async () => {
    await issue(ALICE, ALICE, "123456");
    await issue(BOB, BOB, "123456");
    await asApp(ALICE, "select public.rout_auth_secrets_clear()");
    expect((await db.query("select user_id from public.security_codes")).rows).toEqual([{ user_id: BOB }]);
  });
});
