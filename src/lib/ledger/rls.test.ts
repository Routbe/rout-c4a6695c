// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { generateLedgerKeys } from "./crypto";
it("non-bypass runtime denies foreign ledger rows and cascades keys/ciphertext", async () => {
  const db=new PGlite();
  try {
    await db.exec(`create role rout_app nologin nobypassrls;
      create table public.users(id uuid primary key);
      create function public.rout_current_user_id() returns uuid language sql stable as $$select nullif(current_setting('rout.user_id',true),'')::uuid$$;
      grant usage on schema public to rout_app;`);
    await db.exec(readFileSync(new URL("../../../db/0145_encrypted_user_ledger.sql",import.meta.url),"utf8"));
    const keys=await generateLedgerKeys();
    const owner="11111111-1111-4111-8111-111111111111", foreign="22222222-2222-4222-8222-222222222222";
    for(const user of [owner,foreign]) {
      await db.query("insert into users values($1)",[user]);
      await db.query("insert into user_ledger_keys(user_id,key_id,ledger_public_key,encrypted_ledger_private_key) values($1,$2,$3::jsonb,$4::jsonb)",[user,keys.keyId,JSON.stringify(keys.publicKey),JSON.stringify(keys.envelopes)]);
      await db.query("insert into user_encrypted_audit_logs(user_id,key_id,encrypted_payload) values($1,$2,'ciphertext')",[user,keys.keyId]);
    }
    await db.transaction(async tx => {
      await tx.exec("set local role rout_app");
      await tx.query("select set_config('rout.user_id',$1,true)",[owner]);
      expect((await tx.query("select user_id from user_ledger_keys")).rows).toEqual([{user_id:owner}]);
      expect((await tx.query("select user_id from user_encrypted_audit_logs")).rows).toEqual([{user_id:owner}]);
    });
    await expect(db.transaction(async tx => {
      await tx.exec("set local role rout_app"); await tx.query("select set_config('rout.user_id',$1,true)",[owner]);
      await tx.query("insert into user_encrypted_audit_logs(user_id,key_id,encrypted_payload) values($1,$2,'attack')",[foreign,keys.keyId]);
    })).rejects.toThrow("row-level security");
    await db.transaction(async tx => { await tx.exec("set local role rout_app"); expect((await tx.query("select * from user_ledger_keys")).rows).toHaveLength(0); });
    await db.query("delete from users where id=$1",[owner]);
    for(const table of ["user_ledger_keys","user_encrypted_audit_logs"]) {
      expect((await db.query(`select * from ${table} where user_id=$1`,[owner])).rows).toHaveLength(0);
      expect((await db.query(`select * from ${table} where user_id=$1`,[foreign])).rows).toHaveLength(1);
    }
  } finally { await db.close(); }
},90_000);