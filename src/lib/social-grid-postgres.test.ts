// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const card = { id: "post-1", mediaUrl: "https://images.unsplash.com/photo-1", targetUrl: "https://example.com/article", caption: "Article", platform: "article", pinned: true, isVideo: true, createdAt: "2026-11-03T00:00:00Z" };
beforeAll(async () => {
  await db.exec(`create role rout_app; create table public.users(id uuid primary key);
    create table public.profile_drafts(user_id uuid, space text, payload jsonb);
    grant select,insert,update,delete on public.profile_drafts to rout_app;
    create function public.rout_current_user_id() returns uuid language sql as $$ select nullif(current_setting('rout.current_user_id',true),'')::uuid $$;
    insert into public.users values ('${owner}'),('${other}');`);
  await db.exec(readFileSync("db/0184_social_grid_items.sql", "utf8"));
}, 30_000);
afterAll(() => db.close());

it("indexes alias draft cards with the requested destination, pin and video values", async () => {
  await db.exec("begin; set local role rout_app");
  try {
    await db.query("select set_config('rout.current_user_id',$1,true)", [owner]);
    await db.query("insert into public.profile_drafts values($1,'alias',$2)", [owner, { blocks: [{ id: "grid", kind: "social_grid", value: JSON.stringify({ items: [card] }) }] }]);
    const result = await db.query<{ target_url: string; is_pinned: boolean; is_video: boolean; position: number }>("select target_url,is_pinned,is_video,position from public.social_grid_items");
    expect(result.rows).toEqual([{ target_url: "https://example.com/article", is_pinned: true, is_video: true, position: 0 }]);
  } finally { await db.exec("rollback"); }
});

it("another user cannot read or change the owner's cards", async () => {
  await db.exec("begin");
  try {
    await db.query("insert into public.social_grid_items(user_id,profile_space,block_id,source_item_id,platform,media_url) values($1,'alias','grid','post','custom','https://images.unsplash.com/photo-1')", [owner]);
    await db.exec("set local role rout_app");
    await db.query("select set_config('rout.current_user_id',$1,true)", [other]);
    expect((await db.query("select id from public.social_grid_items")).rows).toEqual([]);
    expect((await db.query("update public.social_grid_items set caption='changed' returning id")).rows).toEqual([]);
  } finally { await db.exec("rollback"); }
});

it("anonymous runtime access cannot read draft cards", async () => {
  await db.exec("begin");
  try {
    await db.query("insert into public.social_grid_items(user_id,profile_space,block_id,source_item_id,platform,media_url) values($1,'alias','grid','post','custom','https://images.unsplash.com/photo-1')", [owner]);
    await db.exec("set local role rout_app");
    expect((await db.query("select id from public.social_grid_items")).rows).toEqual([]);
  } finally { await db.exec("rollback"); }
});

it("removing a grid from a draft removes only that profile space's indexed items", async () => {
  await db.exec("begin; set local role rout_app");
  try {
    await db.query("select set_config('rout.current_user_id',$1,true)", [owner]);
    const payload = { blocks: [{ id: "grid", kind: "social_grid", value: JSON.stringify({ items: [card] }) }] };
    await db.query("insert into public.profile_drafts values($1,'alias',$2),($1,'verified',$2)", [owner, payload]);
    await db.query("update public.profile_drafts set payload=$1 where space='alias'", [{ blocks: [] }]);
    expect((await db.query("select profile_space from public.social_grid_items")).rows).toEqual([{ profile_space: "verified" }]);
  } finally { await db.exec("rollback"); }
});