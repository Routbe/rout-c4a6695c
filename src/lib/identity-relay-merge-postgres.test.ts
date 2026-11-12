// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { listMigrationFiles, planMigrations } from "../../scripts/migration-plan";
import { contextStatements } from "./db-context";

const P = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const T = "33333333-3333-4333-8333-333333333333";
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

beforeAll(async () => {
  for (const step of planMigrations(listMigrationFiles("db"), new Set())) {
    if (step.action === "run") await db.exec(`begin;${readFileSync(`db/${step.file}`, "utf8")};commit;`);
  }
}, 240_000);
afterAll(async () => {
  await db.close();
});

async function seed() {
  await db.exec("begin");
  await db.query("insert into public.users(id,email) values($1,'primary@example.test'),($2,'secondary@example.test')", [P, S]);
  await db.query("update public.profiles set username=case when id=$1 then 'primary' else 'secondary' end where id in ($1,$2)", [P, S]);
  await db.query("insert into public.account_merge_tickets(id,primary_user_id,preview_user_id,pin_hash,token_hash,expires_at) values($1,$2,$3,'ticket','qr',now()+interval '5 minutes')", [T, P, S]);
  await db.query("insert into public.security_codes(user_id,purpose,code_hash,expires_at) values($1,'merge','email-proof',now()+interval '10 minutes')", [S]);
  await db.query("insert into public.oauth_clients(client_id,name) values('app-shared','Shared App'),('app-solo','Solo App')");
  await db.query(
    `insert into public.identity_relays(user_id,connected_app_id,proxy_email,target_email) values
      ($1,'app-shared','priv-aaaaaaaaaaaaaaaaaaaa@mail.rout.be','primary@example.test'),
      ($2,'app-shared','priv-bbbbbbbbbbbbbbbbbbbb@mail.rout.be','secondary@example.test'),
      ($2,'app-solo','priv-cccccccccccccccccccc@mail.rout.be','secondary@example.test')`,
    [P, S],
  );
}

async function mergeAsSecondary() {
  await db.exec("set local role rout_app");
  for (const s of contextStatements({ userId: S, workspaceId: null })) await db.query(s.query, s.params);
  const r = await db.query<{ result: { ok: boolean } }>("select public.execute_account_merge($1,$2,$3,$4) as result", ["ticket", "email-proof", "primary", "primary"]);
  await db.exec("reset role");
  return r.rows[0]?.result;
}

it("moves a secondary relay to the primary and points it at the primary address", async () => {
  try {
    await seed();
    expect((await mergeAsSecondary())?.ok).toBe(true);
    const solo = await db.query<{ user_id: string; target_email: string; proxy_email: string }>(
      "select user_id,target_email,proxy_email from identity_relays where connected_app_id='app-solo'",
    );
    expect(solo.rows).toEqual([{ user_id: P, target_email: "primary@example.test", proxy_email: "priv-cccccccccccccccccccc@mail.rout.be" }]);
  } finally {
    await db.exec("rollback");
  }
}, 30_000);

it("keeps the primary relay on a same-app conflict, archives the duplicate and warns the member", async () => {
  try {
    await seed();
    expect((await mergeAsSecondary())?.ok).toBe(true);
    const shared = await db.query<{ user_id: string; proxy_email: string }>(
      "select user_id,proxy_email from identity_relays where connected_app_id='app-shared'",
    );
    expect(shared.rows).toEqual([{ user_id: P, proxy_email: "priv-aaaaaaaaaaaaaaaaaaaa@mail.rout.be" }]);
    const archived = await db.query<{ user_id: string; merged_from_user_id: string; proxy_email: string }>(
      "select user_id,merged_from_user_id,proxy_email from identity_relay_merge_archive",
    );
    expect(archived.rows).toEqual([{ user_id: P, merged_from_user_id: S, proxy_email: "priv-bbbbbbbbbbbbbbbbbbbb@mail.rout.be" }]);
    const warning = await db.query<{ kind: string; severity: string }>("select kind,severity from notifications where user_id=$1", [P]);
    expect(warning.rows).toEqual([{ kind: "account.merge.relays_archived", severity: "warning" }]);
  } finally {
    await db.exec("rollback");
  }
}, 30_000);

it("a failing merge leaves every relay exactly where it was", async () => {
  try {
    await seed();
    await db.exec(`create function public.relay_failure_probe() returns trigger language plpgsql as $$ begin raise exception 'forced_late_failure'; end $$;
      create trigger relay_failure_probe before delete on public.users for each row execute function public.relay_failure_probe();`);
    await db.exec("savepoint before_merge");
    await expect(mergeAsSecondary()).rejects.toThrow("forced_late_failure");
    await db.exec("rollback to savepoint before_merge");
    const owners = await db.query<{ user_id: string; n: number }>("select user_id, count(*)::int as n from identity_relays group by 1 order by 1");
    expect(owners.rows).toEqual([{ user_id: P, n: 1 }, { user_id: S, n: 2 }]);
    expect((await db.query("select id from identity_relay_merge_archive")).rows).toEqual([]);
  } finally {
    await db.exec("rollback");
  }
}, 30_000);

it("rout_app can read and write rows but never truncate, create tables or write the archive", async () => {
  try {
    await seed();
    await db.exec("set local role rout_app");
    for (const s of contextStatements({ userId: P, workspaceId: null })) await db.query(s.query, s.params);
    expect((await db.query("select id from identity_relays")).rows).toHaveLength(1);
    await db.query("update identity_relays set status='paused' where user_id=$1", [P]);
    await db.exec("savepoint probe");
    await expect(db.query("truncate public.identity_relays")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint probe");
    await expect(db.query("create table public.rogue(id int)")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint probe");
    await expect(db.query("create temporary table rogue_tmp(id int)")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint probe");
    await expect(
      db.query("insert into identity_relay_merge_archive(user_id,merged_from_user_id,connected_app_id,proxy_email,target_email,status,relay_created_at) values($1,$1,'x','a@b.be','a@b.be','active',now())", [P]),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await db.exec("rollback");
  }
}, 30_000);
