// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
beforeAll(async () => {
  await db.exec(`create role rout_app;create table public.users(id uuid primary key);
    insert into public.users values('${owner}'),('${other}');
    create table public.profile_drafts(user_id uuid,space text,payload jsonb);
    grant select,insert,update,delete on public.profile_drafts to rout_app;
    create function public.rout_current_user_id() returns uuid language sql as $$select nullif(current_setting('rout.current_user_id',true),'')::uuid$$;`);
  await db.exec(readFileSync("db/0184_social_grid_items.sql", "utf8"));
  await db.exec(readFileSync("db/0188_omni_ingest.sql", "utf8"));
  await db.exec(readFileSync("db/0190_omni_semantic_catalog.sql", "utf8"));
}, 30000);
afterAll(() => db.close());
const payload = (mediaUrl = `/api/public/gallery-media?path=${owner}%2Fomni-cover.webp`) => ({ blocks: [{ id: "grid", kind: "social_grid", value: JSON.stringify({ items: [{ id: "card", mediaUrl, targetUrl: "https://example.com/event", caption: "Event", contentType: "event", metaTag: "Tomorrow", isHero: true }] }) }] });
it("indexes local paths and semantic values from the private draft", async () => {
  await db.exec("begin;set local role rout_app");
  try {
    await db.query("select set_config('rout.current_user_id',$1,true)", [owner]);
    await db.query("insert into public.profile_drafts values($1,'alias',$2)", [owner, payload()]);
    expect((await db.query("select image_path,title,content_type,meta_tag,is_hero from public.omni_matrix_items")).rows).toEqual([{ image_path: `${owner}/omni-cover.webp`, title: "Event", content_type: "event", meta_tag: "Tomorrow", is_hero: true }]);
    expect((await db.query("select image_path from public.grid_items")).rows).toEqual([{ image_path: `${owner}/omni-cover.webp` }]);
    await db.query("update public.profile_drafts set payload=$1", [{ blocks: [] }]);
    expect((await db.query("select id from public.omni_matrix_items")).rows).toHaveLength(0);
  } finally { await db.exec("rollback"); }
});
it("remote and foreign-owner media cannot enter the semantic projection", async () => {
  await db.exec("begin;set local role rout_app");
  try {
    await db.query("select set_config('rout.current_user_id',$1,true)", [owner]);
    for (const media of ["https://cdn.example.com/photo.jpg", `/api/public/gallery-media?path=${other}%2Fomni-cover.webp`]) {
      await db.query("insert into public.profile_drafts values($1,'alias',$2)", [owner, payload(media)]);
      expect((await db.query("select id from public.omni_matrix_items")).rows).toHaveLength(0);
    }
  } finally { await db.exec("rollback"); }
});
it("compatibility views preserve owner-only visibility", async () => {
  await db.exec("begin;set local role rout_app");
  try {
    await db.query("select set_config('rout.current_user_id',$1,true)", [owner]);
    await db.query("insert into public.profile_drafts values($1,'alias',$2)", [owner, payload()]);
    await db.query("select set_config('rout.current_user_id',$1,true)", [other]);
    expect((await db.query("select id from public.grid_items")).rows).toHaveLength(0);
    expect((await db.query("select id from public.omni_matrix_items")).rows).toHaveLength(0);
  } finally { await db.exec("rollback"); }
});