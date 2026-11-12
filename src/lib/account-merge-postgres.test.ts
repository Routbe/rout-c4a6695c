// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
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
afterAll(async () => { await db.close(); });

async function seed() {
  await db.exec("begin");
  await db.query("insert into public.users(id,email) values($1,'primary@example.test'),($2,'secondary@example.test')", [P, S]);
  await db.query("update public.profiles set username=case when id=$1 then 'primary' else 'secondary' end,bio=case when id=$1 then 'primary design' else 'secondary design' end where id in ($1,$2)", [P, S]);
  await db.query("insert into public.account_merge_tickets(id,primary_user_id,preview_user_id,pin_hash,token_hash,expires_at) values($1,$2,$3,'ticket','qr',now()+interval '5 minutes')", [T, P, S]);
  await db.query("insert into public.security_codes(user_id,purpose,code_hash,expires_at) values($1,'merge','email-proof',now()+interval '10 minutes')", [S]);
  await db.query("insert into public.links(profile_id,title,url) values($1,'secondary link','https://example.test')", [S]);
}
async function caller(id: string) {
  await db.exec("set local role rout_app");
  for (const s of contextStatements({ userId: id, workspaceId: null })) await db.query(s.query, s.params);
}
const merge = (code = "email-proof", handle = "primary", design = "primary") => db.query<{ result: { ok: boolean; reason?: string; primaryUserId?: string } }>(
  "select public.execute_account_merge($1,$2,$3,$4) as result", ["ticket", code, handle, design],
);

it("moves links and preserves both designs as rout_app, without ordinary access to the primary", async () => {
  try {
    await seed(); await caller(S);
    expect((await db.query("select id from public.users where id=$1", [P])).rows).toEqual([]);
    expect((await merge("email-proof", "secondary", "secondary")).rows[0]?.result).toEqual({ ok: true, primaryUserId: P });
    await db.exec("reset role");
    expect((await db.query("select id from public.users where id=$1", [S])).rows).toEqual([]);
    expect((await db.query<{ username: string; bio: string }>("select username,bio from profiles where id=$1", [P])).rows[0]).toEqual({ username: "secondary", bio: "secondary design" });
    expect((await db.query<{ profile_id: string }>("select profile_id from links")).rows[0]?.profile_id).toBe(P);
    expect((await db.query("select payload from profile_design_templates where user_id=$1", [P])).rows).toHaveLength(2);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("a late SQL constraint error rolls back ticket, email proof, links and account deletion together", async () => {
  try {
    await seed();
    await db.exec(`create function public.merge_failure_probe() returns trigger language plpgsql as $$ begin raise exception 'forced_late_failure'; end $$;
      create trigger merge_failure_probe before delete on public.users for each row execute function public.merge_failure_probe();`);
    await db.exec("savepoint before_merge");
    await caller(S);
    await expect(merge()).rejects.toThrow("forced_late_failure");
    await db.exec("rollback to savepoint before_merge");
    expect((await db.query("select id from users where id in ($1,$2)", [P, S])).rows).toHaveLength(2);
    expect((await db.query<{ used_at: unknown }>("select used_at from account_merge_tickets where id=$1", [T])).rows[0]?.used_at).toBeNull();
    expect((await db.query<{ consumed_at: unknown }>("select consumed_at from security_codes where user_id=$1", [S])).rows[0]?.consumed_at).toBeNull();
    expect((await db.query<{ profile_id: string }>("select profile_id from links where profile_id in ($1,$2)", [P, S])).rows[0]?.profile_id).toBe(S);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("rejects an unrelated caller and primary-as-redeemer", async () => {
  for (const id of [P, "44444444-4444-4444-8444-444444444444"]) {
    try { await seed(); await caller(id); await expect(merge()).rejects.toThrow("merge_ticket_not_claimable"); }
    finally { await db.exec("rollback"); }
  }
}, 30_000);

it("wrong email proof increments attempts but leaves ticket and owned data untouched", async () => {
  try {
    await seed(); await caller(S);
    expect((await merge("wrong")).rows[0]?.result).toEqual({ ok: false, reason: "bad_code" });
    await db.exec("reset role");
    expect((await db.query<{ attempts: number; consumed_at: unknown }>("select attempts,consumed_at from security_codes where user_id=$1", [S])).rows[0]).toEqual({ attempts: 1, consumed_at: null });
    expect((await db.query<{ used_at: unknown }>("select used_at from account_merge_tickets where id=$1", [T])).rows[0]?.used_at).toBeNull();
    expect((await db.query<{ profile_id: string }>("select profile_id from links")).rows[0]?.profile_id).toBe(S);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("five attempts, expired email proof and unbound preview all fail closed", async () => {
  for (const change of ["update security_codes set attempts=5", "update security_codes set expires_at=now()-interval '1 second'"]) {
    try {
      await seed(); await db.exec(change); await caller(S);
      expect((await merge()).rows[0]?.result).toEqual({ ok: false, reason: "bad_code" });
    } finally { await db.exec("rollback"); }
  }
  try {
    await seed(); await db.exec("update account_merge_tickets set preview_user_id=null"); await caller(S);
    await expect(merge()).rejects.toThrow("merge_ticket_not_claimable");
  } finally { await db.exec("rollback"); }
}, 30_000);

it("never moves or destroys a secondary disclosure ledger", async () => {
  try {
    await seed();
    await db.query("insert into identity_disclosure_logs(user_id,client_id,disclosed_scopes,ip_hash) values($1,'test-client',array['openid'],'test-ip-hash')", [S]);
    await caller(S);
    await expect(merge()).rejects.toThrow("merge_blocked:identity_disclosure_logs");
  } finally { await db.exec("rollback"); }
}, 30_000);

it("refuses a merge while the secondary still owns a card replacement record", async () => {
  try {
    await seed();
    await db.query("insert into public.rout_card_generations(user_id,generation) values($1,1)", [S]);
    await caller(S);
    await expect(merge()).rejects.toThrow("merge_blocked:rout_card_generations");
  } finally { await db.exec("rollback"); }
}, 30_000);

it("runtime cannot assume the executor role or call the function without a user context", async () => {
  try {
    await seed(); await db.exec("set local role rout_app");
    await expect(merge()).rejects.toThrow("merge_caller_forbidden");
  } finally { await db.exec("rollback"); }
  expect((await db.query<{ allowed: boolean }>("select pg_has_role('rout_app','rout_merge_executor','MEMBER') as allowed")).rows[0]?.allowed).toBe(false);
  expect((await db.query<{ allowed: boolean }>("select has_function_privilege('public','public.execute_account_merge(text,text,text,text)','EXECUTE') as allowed")).rows[0]?.allowed).toBe(false);
}, 30_000);

it("adopts the secondary canonical auth mapping without a uniqueness or cascade loss", async () => {
  const native = "55555555-5555-4555-8555-555555555555";
  try {
    await seed();
    await db.query('insert into neon_auth."user"(id,name,email,"emailVerified") values($1,\'Native\',\'native@example.test\',true)', [native]);
    await db.query("update users set auth_user_id=$1 where id=$2", [native, S]);
    await caller(S); expect((await merge()).rows[0]?.result.ok).toBe(true);
    await db.exec("reset role");
    expect((await db.query<{ auth_user_id: string }>("select auth_user_id from users where id=$1", [P])).rows[0]?.auth_user_id).toBe(native);
    expect((await db.query('select id from neon_auth."user" where id=$1', [native])).rows).toHaveLength(1);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("archives same-provider collisions and moves native passkeys before deleting secondary auth", async () => {
  const a = "55555555-5555-4555-8555-555555555555";
  const b = "66666666-6666-4666-8666-666666666666";
  try {
    await seed();
    await db.query('insert into neon_auth."user"(id,name,email,"emailVerified") values($1,\'A\',\'a@example.test\',true),($2,\'B\',\'b@example.test\',true)', [a, b]);
    await db.query("update users set auth_user_id=case when id=$1 then $3::uuid else $4::uuid end where id in ($1,$2)", [P, S, a, b]);
    await db.query('insert into neon_auth.account("accountId","providerId","userId","updatedAt") values(\'one\',\'google\',$1,now()),(\'two\',\'google\',$2,now())', [a, b]);
    await db.query('insert into neon_auth.passkey(id,"publicKey","userId","credentialID",counter,"deviceType","backedUp") values(\'passkey\',\'public\',$1,\'credential\',0,\'singleDevice\',false)', [b]);
    await db.query('insert into neon_auth."twoFactor"(id,secret,"backupCodes","userId") values(\'factor\',\'fixture\',\'fixture\',$1)', [b]);
    await caller(S); expect((await merge()).rows[0]?.result.ok).toBe(true);
    await db.exec("reset role");
    expect((await db.query<{ userId: string }>('select "userId" from neon_auth.passkey where id=\'passkey\'')).rows[0]?.userId).toBe(a);
    expect((await db.query('select id from neon_auth."twoFactor" where "userId"=$1', [b])).rows).toHaveLength(0);
    expect((await db.query('select id from neon_auth."user" where id=$1', [b])).rows).toHaveLength(0);
    expect((await db.query("select provider_account_id from merged_auth_account_archive where primary_user_id=$1", [P])).rows).toEqual([{ provider_account_id: "two" }]);
    expect((await db.query("select id from users where id=$1", [P])).rows).toHaveLength(1);
  } finally { await db.exec("rollback"); }
}, 30_000);