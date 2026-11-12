// @vitest-environment node
/**
 * db/0223 phase 1 over the real SQL (PGlite, as rout_app): the free-access
 * "rout_server" policies are gone; owners see only their own rows, the account
 * purge may delete only for a genuinely due deletion, unused tables are closed.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const OWNER_TABLES = ["oauth_step_up_challenges", "oauth_step_up_codes"] as const;
let db: PGlite;

async function asApp(ctx: { user?: string; purge?: string }, query: string) {
  await db.query("select set_config('rout.current_user_id', $1, false), set_config('rout.purge_user_id', $2, false)", [ctx.user ?? "", ctx.purge ?? ""]);
  await db.exec("set role rout_app");
  try {
    return (await db.query<Record<string, unknown>>(query)).rows;
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  const tables = [...[...OWNER_TABLES, "user_sessions"].map((t) => `create table public.${t} (id serial primary key, user_id uuid not null);`),
    "create table public.analytics_events (id serial primary key, profile_id uuid);",
    "create table public.profile_ingest_tokens (id serial primary key, user_id uuid);"].join("\n");
  await db.exec(`create role rout_app;
    create table public.account_deletions (user_id uuid primary key, cancelled_at timestamptz, completed_at timestamptz, purge_after timestamptz not null);
    ${tables}`);
  for (const t of [...OWNER_TABLES, "user_sessions", "analytics_events", "profile_ingest_tokens"]) {
    await db.exec(`grant select, insert, update, delete on public.${t} to rout_app; grant usage on all sequences in schema public to rout_app;
      alter table public.${t} enable row level security;
      create policy rout_server on public.${t} to rout_app using (true) with check (true);`);
  }
  for (const t of [...OWNER_TABLES, "user_sessions"]) await db.exec(`insert into public.${t} (user_id) values ('${ALICE}'), ('${BOB}')`);
  for (const f of ["0223_revoke_legacy_rls.sql", "0225_user_sessions_deny_runtime.sql"]) {
    await db.exec(readFileSync(new URL(`../../db/${f}`, import.meta.url), "utf8"));
  }
}, 30_000);
afterAll(async () => db?.close());

describe("db/0223 legacy free access revoked", () => {
  it("lets a member read only their own rows, and nothing without a context", async () => {
    for (const t of OWNER_TABLES) {
      const own = await asApp({ user: ALICE }, `select user_id from public.${t}`);
      expect(own.map((r) => r["user_id"])).toEqual([ALICE]);
      expect(await asApp({}, `select user_id from public.${t}`)).toEqual([]);
    }
  });

  it("refuses writing a row for someone else", async () => {
    await expect(asApp({ user: ALICE }, `insert into public.oauth_step_up_codes (user_id) values ('${BOB}')`)).rejects.toThrow(/row-level security/);
  });

  it("lets the purge delete only when that account's deletion is due", async () => {
    await asApp({ purge: BOB }, "delete from public.oauth_step_up_codes");
    expect((await db.query("select * from public.oauth_step_up_codes where user_id = $1", [BOB])).rows).toHaveLength(1);
    await db.query("insert into public.account_deletions values ($1, null, null, now() + interval '1 day')", [BOB]);
    await asApp({ purge: BOB }, "delete from public.oauth_step_up_codes");
    expect((await db.query("select * from public.oauth_step_up_codes where user_id = $1", [BOB])).rows).toHaveLength(1);
    await db.query("update public.account_deletions set purge_after = now() - interval '1 minute' where user_id = $1", [BOB]);
    await asApp({ purge: BOB }, "delete from public.oauth_step_up_codes");
    expect((await db.query("select user_id from public.oauth_step_up_codes order by user_id")).rows.map((r) => (r as { user_id: string }).user_id)).toEqual([ALICE]);
  });

  it("keeps the legacy session table deny-by-default for the app", async () => {
    expect(await asApp({ user: ALICE }, "select user_id from public.user_sessions")).toEqual([]);
    await asApp({ user: ALICE }, "delete from public.user_sessions");
    expect((await db.query("select * from public.user_sessions")).rows).toHaveLength(2);
  });

  it("closes the unused tables completely", async () => {
    for (const t of ["analytics_events", "profile_ingest_tokens"]) {
      await expect(asApp({ user: ALICE }, `select * from public.${t}`)).rejects.toThrow(/permission denied/);
    }
  });
});
