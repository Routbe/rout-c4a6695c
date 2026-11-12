// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
import { CLAIM_JOB, COMPLETE_JOB, HEARTBEAT_JOB, RECOVER_ZOMBIES } from "../../worker/queue";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const lease = "33333333-3333-4333-8333-333333333333";
beforeAll(async () => {
  await db.exec(`create role rout_app; create table public.users(id uuid primary key);
    insert into public.users values('${owner}'),('${other}');
    create table public.profiles(id uuid,username text,blocks jsonb);
    create table public.alias_profiles(user_id uuid,handle text,blocks jsonb);
    create function public.rout_current_user_id() returns uuid language sql as $$select nullif(current_setting('rout.current_user_id',true),'')::uuid$$;
    create function public.rout_qa_owner(h text,s text) returns table(owner_id uuid) language sql as $$select '${owner}'::uuid where h='public'$$;`);
  await db.exec(readFileSync("db/0188_omni_ingest.sql", "utf8"));
  await db.exec(readFileSync("db/0189_omni_worker.sql", "utf8"));
}, 30_000);
afterAll(() => db.close());
async function insert() {
  const result = await db.query<{ id: string }>("insert into public.omni_jobs(user_id,source,source_url) values($1,'studio','https://example.com/article') returning id", [owner]);
  const id = result.rows[0]?.id; if (!id) throw new Error("no_job"); return id;
}
it("claims a queued job exactly once and commits a lease before processing", async () => {
  await db.exec("begin");
  try {
    const id = await insert();
    const first = await db.query<{ id: string; status: string; attempts: number }>(CLAIM_JOB, [lease]);
    expect(first.rows[0]).toMatchObject({ id, status: "processing", attempts: 1 });
    expect((await db.query(CLAIM_JOB, [lease])).rows).toHaveLength(0);
  } finally { await db.exec("rollback"); }
});
it("recovers only jobs older than five minutes, not healthy jobs", async () => {
  await db.exec("begin");
  try {
    const old = await insert(); const fresh = await insert();
    await db.query("update public.omni_jobs set status='processing',attempts=1,updated_at=now()-interval '6 minutes' where id=$1", [old]);
    await db.query("update public.omni_jobs set status='processing',attempts=1,updated_at=now()-interval '4 minutes' where id=$1", [fresh]);
    await db.exec(RECOVER_ZOMBIES);
    expect((await db.query<{ status: string }>("select status from public.omni_jobs where id=$1", [old])).rows[0]?.status).toBe("queued");
    expect((await db.query<{ status: string }>("select status from public.omni_jobs where id=$1", [fresh])).rows[0]?.status).toBe("processing");
  } finally { await db.exec("rollback"); }
});
it("a stale worker cannot heartbeat or finish after its lease was replaced", async () => {
  await db.exec("begin");
  try {
    const id = await insert(); await db.query(CLAIM_JOB, [lease]);
    await db.query("update public.omni_jobs set lease_token=$2 where id=$1", [id, other]);
    expect((await db.query(HEARTBEAT_JOB, [id, lease])).rows).toHaveLength(0);
    expect((await db.query(COMPLETE_JOB, [id, lease, "article", "Title", null, `${owner}/omni-cover.webp`, null])).rows).toHaveLength(0);
  } finally { await db.exec("rollback"); }
});
it("anonymous readers cannot access queued jobs or unpublished S3 media", async () => {
  await db.exec("begin");
  try {
    const id = await insert(); const path = `${owner}/omni-cover.webp`;
    await db.query("update public.omni_jobs set status='ready',local_media_path=$2 where id=$1", [id, path]);
    await db.exec("set local role rout_app");
    expect((await db.query("select id from public.omni_jobs")).rows).toHaveLength(0);
    expect((await db.query("select * from public.rout_omni_media($1,null)", [path])).rows).toHaveLength(0);
    expect((await db.query("select * from public.rout_omni_media($1,$2)", [path, owner])).rows).toHaveLength(0);
  } finally { await db.exec("rollback"); }
});
it("owners can preview private media; public visitors need the published card", async () => {
  await db.exec("begin");
  try {
    const id = await insert(); const path = `${owner}/omni-cover.webp`;
    await db.query("update public.omni_jobs set status='ready',local_media_path=$2 where id=$1", [id, path]);
    await db.query("select set_config('rout.current_user_id',$1,true)", [owner]);
    expect((await db.query("select * from public.rout_omni_media($1,$2)", [path, owner])).rows).toEqual([{ object_key: `users/${path}`, content_type: "image/webp" }]);
    await db.query("select set_config('rout.current_user_id','',true)");
    await db.query("insert into public.profiles values($1,'public',$2)", [owner, [{ kind: "social_grid", value: JSON.stringify({ items: [{ mediaUrl: `/api/public/gallery-media?path=${encodeURIComponent(path)}` }] }) }]]);
    expect((await db.query("select * from public.rout_omni_media($1,null)", [path])).rows).toHaveLength(1);
    const video = `${owner}/omni-preview.webm`;
    await db.query("update public.omni_jobs set kinetic_preview_path=$2 where id=$1", [id, video]);
    await db.query("update public.profiles set blocks=$1", [[{ kind: "social_grid", value: JSON.stringify({ items: [{ mediaUrl: `/api/public/gallery-media?path=${encodeURIComponent(path)}`, kineticPreviewUrl: `/api/public/gallery-media?path=${encodeURIComponent(video)}` }] }) }]]);
    expect((await db.query("select * from public.rout_omni_media($1,null)", [video])).rows).toEqual([{ object_key: `users/${video}`, content_type: "video/webm" }]);
    await db.query("update public.profiles set username='private'");
    expect((await db.query("select * from public.rout_omni_media($1,null)", [path])).rows).toHaveLength(0);
  } finally { await db.exec("rollback"); }
});
it("three interrupted attempts produce a terminal failure", async () => {
  await db.exec("begin");
  try {
    const id = await insert();
    await db.query("update public.omni_jobs set status='processing',attempts=3,updated_at=now()-interval '6 minutes' where id=$1", [id]);
    await db.exec(RECOVER_ZOMBIES);
    expect((await db.query<{ status: string; error: string }>("select status,error from public.omni_jobs where id=$1", [id])).rows[0]).toEqual({ status: "failed", error: "worker_interrupted" });
  } finally { await db.exec("rollback"); }
});