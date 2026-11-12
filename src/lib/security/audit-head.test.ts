// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const U="11111111-1111-4111-8111-111111111111";
const migration=(name:string)=>readFileSync(new URL(`../../../db/${name}`,import.meta.url),"utf8");
it("protects the retained audit head, detects removed tail, and rolls head updates back", async () => {
  const db=new PGlite();
  try {
    await db.exec(`create role rout_app nologin nobypassrls;
      create table public.users(id uuid primary key);
      create table public.identity_disclosure_logs(id uuid primary key default gen_random_uuid(),user_id uuid references users(id) on delete cascade,client_id text not null,disclosed_scopes text[] not null,disclosed_at timestamptz not null default now());
      grant usage on schema public to rout_app;
      grant select,insert,update on users to rout_app;
      insert into users values('${U}');`);
    await db.exec(migration("0146_merkle_disclosure_ledger.sql"));
    await db.exec(migration("0150_audit_head_lock.sql"));
    await db.query("insert into identity_disclosure_logs(user_id,client_id,disclosed_scopes) values($1,'a',array['openid'])",[U]);
    const first=(await db.query<{latest_audit_hash:string}>("select latest_audit_hash from users")).rows[0]?.latest_audit_hash;
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    await db.transaction(async tx => {
      await tx.exec("set local role rout_app");
      await tx.query("select set_config('rout.current_user_id',$1,true)",[U]);
      expect((await tx.query<{uid:string}>("select public.rout_current_user_id() as uid")).rows[0]?.uid).toBe(U);
      await expect(tx.query("update users set latest_audit_hash=$1",["f".repeat(64)])).rejects.toThrow("trigger-managed");
      // The rejected statement aborts this transaction; leave rollback to PGlite.
      throw new Error("rollback protected-head attempt");
    }).catch(error => { expect(error.message).toBe("rollback protected-head attempt"); });
    await db.exec("begin");
    await db.query("insert into identity_disclosure_logs(user_id,client_id,disclosed_scopes) values($1,'b',array['openid'])",[U]);
    await db.exec("rollback");
    expect((await db.query<{latest_audit_hash:string}>("select latest_audit_hash from users")).rows[0]?.latest_audit_hash).toBe(first);
    await db.query("insert into identity_disclosure_logs(user_id,client_id,disclosed_scopes) values($1,'b',array['openid'])",[U]);
    const retained=(await db.query<{latest_audit_hash:string}>("select latest_audit_hash from users")).rows[0]?.latest_audit_hash;
    expect(retained).not.toBe(first);
    await db.exec("delete from identity_disclosure_logs where client_id='b'");
    expect((await db.query<{entry_hash:string}>("select entry_hash from identity_disclosure_logs")).rows[0]?.entry_hash).not.toBe(retained);
    await expect(db.query("update users set latest_audit_hash=$1",[first])).rejects.toThrow("trigger-managed");
    await db.query("delete from users where id=$1",[U]);
    expect((await db.query("select * from identity_disclosure_logs")).rows).toHaveLength(0);
  } finally { await db.close(); }
},30000);