// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("removes rout_app bypass and denies tenant reads of Mastodon client secrets", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role rout_app bypassrls;
      create function public.rout_current_user_id() returns uuid language sql stable
        as $$ select nullif(current_setting('rout.user_id',true),'')::uuid $$;
      create table account_deletions(user_id uuid,cancelled_at timestamptz,completed_at timestamptz,purge_after timestamptz);
      create table merged_auth_account_archive(primary_user_id uuid);
      alter table merged_auth_account_archive enable row level security;
      create table mastodon_app_registrations(client_secret text);
      insert into mastodon_app_registrations values ('server-only secret');`);
    for (const table of ["account_deletion_audit", "identity_disclosure_logs", "security_audit_checkpoints", "verified_identities", "webhook_deliveries"]) {
      await db.exec(`create table ${table}(id uuid)`);
    }
    await db.exec(readFileSync(new URL("../../db/0149_strict_rls_enforcement.sql",import.meta.url),"utf8"));
    expect((await db.query<{ rolbypassrls: boolean }>("select rolbypassrls from pg_roles where rolname='rout_app'")).rows[0]?.rolbypassrls).toBe(false);
    await db.exec("set role rout_app");
    expect((await db.query("select * from mastodon_app_registrations")).rows).toHaveLength(0);
    await expect(db.query("insert into mastodon_app_registrations values ('forged')")).rejects.toThrow();
  } finally { await db.close(); }
}, 20_000);