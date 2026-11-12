// @vitest-environment node
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {beforeAll,afterAll,it,expect} from "vitest";
const db=new PGlite();const owner="11111111-1111-4111-8111-111111111111";
beforeAll(async()=>{
 await db.exec(`create role rout_app;create table public.users(id uuid primary key);insert into public.users values('${owner}');
 create table public.profiles(id uuid,username text,blocks jsonb);create table public.alias_profiles(user_id uuid,handle text,blocks jsonb);
 create table public.profile_questions(id uuid,owner_id uuid,space text,body text,answer text,published boolean,is_quarantined boolean,answered_at timestamptz,story_until timestamptz);
 create function public.rout_current_user_id() returns uuid language sql as $$select nullif(current_setting('rout.current_user_id',true),'')::uuid$$;
 create function public.rout_qa_owner(h text,s text) returns table(owner_id uuid) language sql as $$select '${owner}'::uuid where h='public'$$;`);
 await db.exec(readFileSync("db/0185_ephemeral_presence.sql","utf8"));
 await db.exec("create table public.user_integrations(user_id uuid,provider text,connection_status text,status_json jsonb default '{\"broadcastSpaces\":[\"alias\"]}');grant select on public.user_integrations to rout_app;");
 await db.exec(readFileSync("db/0186_presence_broadcast.sql","utf8"));
 await db.exec(readFileSync("db/0187_presence_broadcast_boundaries.sql","utf8"));
 await db.query("select set_config('rout.current_user_id',$1,false)",[owner]);
 await db.query("insert into public.alias_profiles(user_id,handle) values($1,'public')",[owner]);
},30000);
afterAll(()=>db.close());
it("database defaults are exactly 24 hours and cannot be extended by update",async()=>{
 await db.exec("begin;set local role rout_app");
 try {
 await db.query("select set_config('rout.current_user_id',$1,true)",[owner]);
 const r=await db.query<{id:string;hours:number}>("insert into public.ephemeral_statuses(user_id,space,status_type,content_payload) values($1,'alias','micro_text',$2) returning id,extract(epoch from expires_at-created_at)/3600 as hours",[owner,{text:"Hello"}]);
 expect(Number(r.rows[0]?.hours)).toBe(24);
 const result=await db.query<{hours:number}>("update public.ephemeral_statuses set expires_at=now()+interval '48 hours' returning extract(epoch from expires_at-created_at)/3600 as hours");expect(Number(result.rows[0]?.hours)).toBe(24);
 } finally {await db.exec("rollback");}
});
it("database rejects media payloads and missing or oversized text",async()=>{
 for(const payload of [{},{text:"a".repeat(281)},{text:"hello",file:"blob"},{text:"hello",theme:null}]) {
 await expect(db.query("insert into public.ephemeral_statuses(user_id,space,status_type,content_payload) values($1,'alias','micro_text',$2)",[owner,payload])).rejects.toThrow();
 }
});
it("public boundary excludes expired statuses and private handles",async()=>{
 await db.exec("begin");
 try {
 await db.query("insert into public.ephemeral_statuses(user_id,space,status_type,content_payload) values($1,'alias','micro_text',$2)",[owner,{text:"Hello"}]);
 expect((await db.query<{stories:unknown[]}>("select public.rout_presence_public('private','alias') as stories")).rows[0]?.stories).toEqual([]);
 expect((await db.query<{stories:unknown[]}>("select public.rout_presence_public('public','alias') as stories")).rows[0]?.stories).toHaveLength(1);
 await db.exec("alter table public.ephemeral_statuses disable trigger presence_validation;update public.ephemeral_statuses set expires_at=now()-interval '1 second'");
 expect((await db.query<{stories:unknown[]}>("select public.rout_presence_public('public','alias') as stories")).rows[0]?.stories).toEqual([]);
 } finally {await db.exec("rollback");}
});
it("another runtime user cannot read or modify private status rows",async()=>{
 await db.exec("begin");try{
 await db.query("insert into public.ephemeral_statuses(user_id,space,status_type,content_payload) values($1,'alias','micro_text',$2)",[owner,{text:"Hello"}]);await db.exec("set local role rout_app");
 await db.query("select set_config('rout.current_user_id',$1,true)",["22222222-2222-4222-8222-222222222222"]);
 expect((await db.query("select * from public.ephemeral_statuses")).rows).toEqual([]);
 expect((await db.query("delete from public.ephemeral_statuses returning id")).rows).toEqual([]);
 }finally{await db.exec("rollback");}
});
it("status insert transaction creates one job for each connected open-network broadcast",async()=>{
 await db.exec("begin");try{
 await db.query("insert into public.user_integrations(user_id,provider,connection_status) values($1,'omnicast_mastodon','connected'),($1,'omnicast_telegram','disconnected'),($1,'instagram','connected')",[owner]);
 await db.query("insert into public.ephemeral_statuses(user_id,space,status_type,content_payload) values($1,'alias','micro_text',$2)",[owner,{text:"Live update"}]);
 expect((await db.query("select provider,payload from public.presence_broadcast_jobs")).rows).toEqual([{provider:"omnicast_mastodon",payload:{text:"Live update"}}]);
 }finally{await db.exec("rollback");}
});
it("quarantined Q&A replies never create background broadcasts",async()=>{
 await db.exec("begin");try{
 await db.query("insert into public.user_integrations(user_id,provider,connection_status) values($1,'omnicast_mastodon','connected')",[owner]);
 await db.query("insert into public.profile_questions(id,owner_id,space,body,answer,published,is_quarantined) values($1,$1,'alias','Private','Reply',false,true)",[owner]);
 await db.exec("update public.profile_questions set published=true");expect((await db.query("select id from public.presence_broadcast_jobs")).rows).toEqual([]);
 }finally{await db.exec("rollback");}
});
it("private canvases and unconsented aliases never create external jobs",async()=>{
 await db.exec('begin');try{
 await db.query("insert into public.user_integrations(user_id,provider,connection_status,status_json) values($1,'omnicast_mastodon','connected','{\"broadcastSpaces\":[\"root\"]}')",[owner]);
 await db.query("insert into public.ephemeral_statuses(user_id,space,status_type,content_payload) values($1,'alias','micro_text',$2)",[owner,{text:'No alias consent'}]);
 expect((await db.query('select id from public.presence_broadcast_jobs')).rows).toEqual([]);
 await db.exec("update public.alias_profiles set handle='private';update public.user_integrations set status_json='{\"broadcastSpaces\":[\"alias\"]}'");
 await db.query("insert into public.ephemeral_statuses(user_id,space,status_type,content_payload) values($1,'alias','micro_text',$2)",[owner,{text:'Private'}]);
 expect((await db.query('select id from public.presence_broadcast_jobs')).rows).toEqual([]);
 }finally{await db.exec('rollback');}
});
it("delivery authorization rejects expired, retracted and cross-owner Q&A",async()=>{
 await db.exec('begin');try{
 await db.query("insert into public.profile_questions(id,owner_id,space,body,answer,published,is_quarantined,story_until) values($1,$1,'alias','Question','Answer',true,false,now()+interval '24 hours')",[owner]);
 const allowed=async()=> (await db.query<{ok:boolean}>("select public.rout_broadcast_event_allowed($1,$1,'alias') as ok",[owner])).rows[0]?.ok;
 expect(await allowed()).toBe(true);
 await db.exec("update public.profile_questions set published=false");expect(await allowed()).toBe(false);
 await db.exec("update public.profile_questions set published=true,story_until=now()-interval '1 second'");expect(await allowed()).toBe(false);
 await db.exec("update public.profile_questions set story_until=now()+interval '24 hours'");
 await db.query("select set_config('rout.current_user_id',$1,true)",['22222222-2222-4222-8222-222222222222']);expect(await allowed()).toBe(false);
 }finally{await db.exec('rollback');}
});