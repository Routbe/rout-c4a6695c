// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("database projection requires acceptance, app publication and consent; recipient cannot issue or edit claims", async () => {
  const db = new PGlite();
  const user = "11111111-1111-4111-8111-111111111111";
  try {
    await db.exec(`create role rout_app nologin nobypassrls;
      grant usage on schema public to rout_app;
      create table users(id uuid primary key,is_disabled boolean default false);
      create table profiles(id uuid primary key,username text,is_banned boolean default false,is_suspended boolean default false,display_prefs jsonb default '{}');
      create table oauth_clients(client_id text primary key,name text,status text,owner_user_id uuid);
      create table oauth_consents(user_id uuid,client_id text,revoked_at timestamptz);
      create function public.rout_current_user_id() returns uuid language sql as $$ select nullif(current_setting('rout.current_user_id',true),'')::uuid $$;`);
    await db.exec(readFileSync("db/0153_app_issued_credentials.sql", "utf8"));
    await db.query("insert into users values($1,false);", [user]);
    await db.query("insert into profiles(id,username) values($1,'member')", [user]);
    await db.exec("insert into oauth_clients values('app','App','active',null)");
    await db.query("insert into oauth_consents values($1,'app',null)", [user]);
    await db.query("insert into app_issued_credentials(user_id,client_id,type,title,request_key) values($1,'app','diploma','Diploma','one')", [user]);
    const read = async () => (await db.query("select * from public.public_app_credentials('member')")).rows;
    expect(await read()).toHaveLength(0);
    await db.exec("update app_issued_credentials set accepted_at=now()");
    expect(await read()).toHaveLength(0);
    await db.query("insert into user_connected_apps_visibility values($1,'app',true)", [user]);
    expect(await read()).toHaveLength(1);
    await db.exec("update oauth_consents set revoked_at=now()");
    expect(await read()).toHaveLength(0);
    await db.exec("begin;set local role rout_app");
    await db.query("select set_config('rout.current_user_id',$1,true)", [user]);
    await expect(db.exec("update app_issued_credentials set title='Forged'")).rejects.toThrow("permission denied");
    await db.exec("rollback;begin;set local role rout_app");
    await expect(db.query("insert into app_issued_credentials(user_id,client_id,type,title,request_key) values($1,'app','badge','Forged','two')", [user])).rejects.toThrow("permission denied");
    await db.exec("rollback");
    await db.query("delete from users where id=$1", [user]);
    expect((await db.query("select * from app_issued_credentials")).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 30_000);