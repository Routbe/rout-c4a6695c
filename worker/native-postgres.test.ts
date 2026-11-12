import { test, expect } from "bun:test";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { CLAIM_JOB } from "./queue";

// Opt-in disposable database ONLY; never run against the production schema.
test.skipIf(!process.env.OMNI_DISPOSABLE_TEST_URL)("native commit notifications and concurrent SKIP LOCKED claims", async () => {
  const url = process.env.OMNI_DISPOSABLE_TEST_URL;
  if (!url) throw new Error("missing_disposable_database");
  const db = postgres(url, { max: 3 });
  const listen = postgres(url, { max: 1 });
  const notices: string[] = [];
  try {
    await db.unsafe(`create role rout_app; create table public.users(id uuid primary key);
      insert into public.users values('11111111-1111-4111-8111-111111111111');
      create table public.profiles(id uuid,username text,blocks jsonb);
      create table public.alias_profiles(user_id uuid,handle text,blocks jsonb);
      create function public.rout_current_user_id() returns uuid language sql as $$select nullif(current_setting('rout.current_user_id',true),'')::uuid$$;
      create function public.rout_qa_owner(h text,s text) returns table(owner_id uuid) language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid where h='public'$$;`);
    await db.unsafe(await readFile(new URL("../db/0188_omni_ingest.sql", import.meta.url), "utf8"));
    await db.unsafe(await readFile(new URL("../db/0189_omni_worker.sql", import.meta.url), "utf8"));
    await listen.listen("new_omni_job", (payload) => notices.push(JSON.parse(payload).id));
    let release = () => {}; const barrier = new Promise<void>((resolve) => { release = resolve; });
    let inserted = () => {}; const staged = new Promise<void>((resolve) => { inserted = resolve; });
    const transaction = db.begin(async (sql) => {
      await sql`insert into public.omni_jobs(user_id,source,source_url) values('11111111-1111-4111-8111-111111111111','studio','https://example.com/one')`;
      inserted(); await barrier;
    });
    await staged; await Bun.sleep(50); expect(notices).toHaveLength(0);
    release(); await transaction;
    for (let i = 0; i < 20 && notices.length === 0; i++) await Bun.sleep(25);
    expect(notices).toHaveLength(1);
    await db`insert into public.omni_jobs(user_id,source,source_url) values('11111111-1111-4111-8111-111111111111','studio','https://example.com/two')`;
    let unlock = () => {}; const lockBarrier = new Promise<void>((resolve) => { unlock = resolve; });
    let locked = () => {}; const lockReady = new Promise<void>((resolve) => { locked = resolve; });
    const lockedTransaction = db.begin(async (sql) => {
      const rows = await sql`select id from public.omni_jobs order by created_at for update limit 1`;
      locked(); await lockBarrier; return rows[0]?.id;
    });
    await lockReady;
    const claimed = await db.unsafe(CLAIM_JOB, [crypto.randomUUID()]);
    expect(claimed).toHaveLength(1);
    unlock(); const lockedId = await lockedTransaction;
    expect(claimed[0]?.id).not.toBe(lockedId);
    const next = await db.unsafe(CLAIM_JOB, [crypto.randomUUID()]);
    expect(next[0]?.id).toBe(lockedId);
    expect((await db.unsafe(CLAIM_JOB, [crypto.randomUUID()]))).toHaveLength(0);
  } finally { await listen.end(); await db.end(); }
}, 15000);