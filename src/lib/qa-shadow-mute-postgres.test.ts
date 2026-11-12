// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { listMigrationFiles, planMigrations } from "../../scripts/migration-plan";
import { contextStatements } from "./db-context";

const R = "aaaaaaaa-1111-4111-8111-111111111111"; // recipient
const A = "bbbbbbbb-2222-4222-8222-222222222222"; // signed-in sender
const R2 = "cccccccc-3333-4333-8333-333333333333";
const R3 = "dddddddd-4444-4444-8444-444444444444";
const KEY = "a".repeat(64); // device base key (the app derives it with HMAC)
const ACCT_A = "c".repeat(64); // account base key of A
const ABUSE_A = "d".repeat(64); // current abuse key of A
const NET1 = "1".repeat(64);
const NET2 = "2".repeat(64);
const NET3 = "3".repeat(64);
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

beforeAll(async () => {
  for (const step of planMigrations(listMigrationFiles("db"), new Set())) {
    if (step.action === "run") await db.exec(`begin;${readFileSync(`db/${step.file}`, "utf8")};commit;`);
  }
}, 240_000);
afterAll(async () => { await db.close(); });

async function seed() {
  await db.exec("begin");
  await db.query("insert into public.users(id,email) values($1,'r@example.test'),($2,'a@example.test'),($3,'r2@example.test'),($4,'r3@example.test')", [R, A, R2, R3]);
  await db.query("update public.profiles set username = case id when $1::uuid then 'recipient' when $2::uuid then 'sender' when $3::uuid then 'second' else 'third' end, display_prefs = coalesce(display_prefs, '{}'::jsonb) || '{\"questionsEnabled\":true,\"qaAudience\":\"public_unrestricted\"}'::jsonb where id in ($1,$2,$3,$4)", [R, A, R2, R3]);
}
async function as(id: string | null) {
  await db.exec("reset role");
  await db.exec("set local role rout_app");
  signedIn = id;
  for (const s of contextStatements({ userId: id, workspaceId: null })) await db.query(s.query, s.params);
}
/** Like the app: signed-in senders get account + abuse keys, guests only a device key. */
let signedIn: string | null = null;
const submit = (handle: string, body: string, key: string | null = null, space: "root" | "alias" = "root") =>
  db.query<{ r: string }>("select public.rout_qa_submit($1,$2,$3,$4,$5,$6,null,false) as r",
    [handle, space, body, key, signedIn === A ? ACCT_A : null, signedIn === A ? ABUSE_A : null]).then((x) => x.rows[0]?.r);
const inbox = () =>
  db.query<{ id: string; body: string }>("select id, body from public.profile_questions where not is_quarantined order by created_at");
const mute = (id: string, net: string | null = null) =>
  db.query<{ ok: boolean }>("select public.rout_qa_mute_by_message($1,$2) as ok", [id, net]).then((x) => x.rows[0]?.ok);
/** Global trust now lives on the rotating abuse key, not on the account row. */
const abuseTrust = async (key = ABUSE_A) => {
  await db.exec("reset role");
  return (await db.query<{ trust_score: number; ban_starts_at: Date | null; ban_until: Date | null }>(
    "select trust_score, ban_starts_at, ban_until from public.qa_guest_trust where sender_key=$1", [key])).rows[0] ?? { trust_score: 100, ban_starts_at: null, ban_until: null };
};
const ageCharges = async (hours: number) => {
  await db.exec("reset role");
  await db.query(`update public.qa_trust_charges set charged_at = charged_at - interval '${hours} hours'`);
};
const trust = async (id: string) => {
  await db.exec("reset role");
  return (await db.query<{ trust_score: number; global_shadow_ban_starts_at: Date | null; global_shadow_ban_until: Date | null }>(
    "select trust_score, global_shadow_ban_starts_at, global_shadow_ban_until from public.users where id=$1", [id])).rows[0];
};

it("a draft save stays private until explicit publication", async () => {
  try {
    await seed();
    await db.query("insert into public.profile_drafts(user_id,space,payload,revision,published_revision) values($1,'verified',$2::jsonb,1,1)", [R, JSON.stringify({ username: "recipient", displayName: "Live", displayPrefs: {} })]);
    await db.query("update public.profiles set display_name='Live' where id=$1", [R]);
    await as(R);
    await db.query("select * from public.patch_profile_draft($1,'verified',$2::jsonb,'{}'::jsonb,'{}'::text[])", [R, JSON.stringify({ displayName: "Private draft" })]);
    expect((await db.query<{ display_name: string }>("select display_name from public.profiles where id=$1", [R])).rows[0]?.display_name).toBe("Live");
    expect((await db.query<{ name: string }>("select payload->>'displayName' as name from public.profile_drafts where user_id=$1 and space='verified'", [R])).rows[0]?.name).toBe("Private draft");
    await db.query("select * from public.publish_profile_draft($1,'verified',2)", [R]);
    expect((await db.query<{ display_name: string }>("select display_name from public.profiles where id=$1", [R])).rows[0]?.display_name).toBe("Private draft");
  } finally { await db.exec("rollback"); }
}, 30_000);

it("the database rejects guests for a members-only canvas", async () => {
  try {
    await seed();
    await db.query("update public.profiles set display_prefs=display_prefs || '{\"qaAudience\":\"members_only\"}'::jsonb where id=$1", [R]);
    await as(null);
    expect(await submit("recipient", "guest", KEY)).toBe("not_found");
    await as(A);
    expect(await submit("recipient", "member", KEY)).toBe("ok");
    await as(R);
    expect((await inbox()).rows.map((q) => q.body)).toEqual(["member"]);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("public Q&A includes only whitelisted published design preferences", async () => {
  try {
    await seed();
    await db.query("update public.profiles set display_prefs=display_prefs || $2::jsonb where id=$1", [R, JSON.stringify({ typographyCustom: true, fontPairing: "editorial", glassStyle: "obsidian", glassBlur: 20, privateTestSetting: "never public" })]);
    await as(null);
    const result = await db.query<{ qa: { design: Record<string, unknown> } }>("select public.rout_qa_public('recipient','root') as qa");
    expect(result.rows[0]?.qa.design).toMatchObject({ typographyCustom: true, fontPairing: "editorial", glassStyle: "obsidian", glassBlur: 20 });
    expect(result.rows[0]?.qa.design).not.toHaveProperty("privateTestSetting");
  } finally { await db.exec("rollback"); }
}, 30_000);

it("a muted sender still gets ok, but the message never reaches the inbox", async () => {
  try {
    await seed();
    await as(A);
    expect(await submit("recipient", "eerste bericht", KEY)).toBe("ok");
    await as(R);
    const [first] = (await inbox()).rows;
    expect(first?.body).toBe("eerste bericht");
    expect(await mute(first!.id)).toBe(true);
    expect((await inbox()).rows).toEqual([]);

    await as(A);
    expect(await submit("recipient", "tweede bericht", KEY)).toBe("ok");
    await as(R);
    expect((await inbox()).rows).toEqual([]);
    await db.exec("reset role");
    const stored = await db.query<{ is_quarantined: boolean; quarantine_reason: string }>("select is_quarantined, quarantine_reason from public.profile_questions where body='tweede bericht'");
    expect(stored.rows[0]).toEqual({ is_quarantined: true, quarantine_reason: "local_mute" });
  } finally { await db.exec("rollback"); }
}, 30_000);

it("the recipient's runtime role can never read who sent a question", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "wie ben ik?", KEY);
    await as(R);
    await db.exec("savepoint s");
    await expect(db.query("select sender_user_id from public.profile_questions")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("select sender_key from public.profile_questions")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("select muted_sender_id from public.shadow_mutes")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("insert into public.profile_questions(owner_id, body) values ($1, 'x')", [R])).rejects.toThrow(/permission denied/);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("each mute costs the sender 20 trust points", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "hallo", null);
    await as(R);
    await mute((await inbox()).rows[0]!.id);
    expect((await abuseTrust()).trust_score).toBe(80);
    expect((await trust(A))?.trust_score).toBe(100);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("below 50 trust points a 7-day global ban starts after a 12-48 hour delay", async () => {
  try {
    await seed();
    for (const handle of ["recipient", "second", "third"]) {
      await as(A);
      await submit(handle, `bericht aan ${handle}`, null);
    }
    const nets = [NET1, NET2, NET3];
    for (const [i, owner] of [R, R2, R3].entries()) {
      await as(owner);
      await mute((await inbox()).rows.find(() => true)!.id, nets[i]);
      await ageCharges(25);
    }
    const t = await abuseTrust();
    expect(t.trust_score).toBe(40);
    const delayH = (new Date(t.ban_starts_at!).getTime() - Date.now()) / 3_600_000;
    expect(delayH).toBeGreaterThanOrEqual(11.9);
    expect(delayH).toBeLessThanOrEqual(48.1);
    const lengthD = (new Date(t.ban_until!).getTime() - new Date(t.ban_starts_at!).getTime()) / 86_400_000;
    expect(lengthD).toBeCloseTo(7, 5);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("a mob cannot drain a sender: at most 20 points per 24 hours, and one muter network counts once a week", async () => {
  try {
    await seed();
    for (const handle of ["recipient", "second", "third"]) {
      await as(A);
      await submit(handle, `bericht aan ${handle}`, null);
    }
    await as(R); await mute((await inbox()).rows[0]!.id, NET1);
    await as(R2); await mute((await inbox()).rows[0]!.id, NET2);
    expect((await abuseTrust()).trust_score).toBe(80);
    await ageCharges(25);
    await as(R3); await mute((await inbox()).rows[0]!.id, NET1);
    expect((await abuseTrust()).trust_score).toBe(80);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("an active global ban quarantines messages to everyone while still answering ok", async () => {
  try {
    await seed();
    await db.query("update public.users set trust_score=40, global_shadow_ban_starts_at=now()-interval '1 hour', global_shadow_ban_until=now()+interval '6 days' where id=$1", [A]);
    await as(A);
    expect(await submit("second", "nieuw bericht", null)).toBe("ok");
    await as(R2);
    expect((await inbox()).rows).toEqual([]);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("only the recipient can mute through a message id", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "hoi", KEY);
    await db.exec("reset role");
    const id = (await db.query<{ id: string }>("select id from public.profile_questions")).rows[0]!.id;
    await as(R2);
    expect(await mute(id)).toBe(false);
    expect((await abuseTrust()).trust_score).toBe(100);
  } finally { await db.exec("rollback"); }
}, 30_000);

const myMutes = () =>
  db.query<{ id: string; excerpt: string | null }>("select id, excerpt from public.rout_qa_my_mutes()").then((x) => x.rows);
const unmute = (id: string) => db.query<{ ok: boolean }>("select public.rout_qa_unmute($1) as ok", [id]).then((x) => x.rows[0]?.ok);

it("lifting a mute lets new messages through again and returns the muted message", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "eerste", KEY);
    await as(R);
    await mute((await inbox()).rows[0]!.id);
    const list = await myMutes();
    expect(list).toHaveLength(1);
    expect(list[0]?.excerpt).toBe("eerste");
    expect(await unmute(list[0]!.id)).toBe(true);
    expect(await myMutes()).toEqual([]);
    expect((await inbox()).rows.map((r) => r.body)).toEqual(["eerste"]);
    await as(A);
    await submit("recipient", "na opheffen", KEY);
    await as(R);
    expect((await inbox()).rows.map((r) => r.body).sort()).toEqual(["eerste", "na opheffen"]);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("muting, lifting and muting the same sender again costs trust only once", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "een", null);
    await as(R);
    const first = (await inbox()).rows[0]!.id;
    await mute(first);
    await unmute((await myMutes())[0]!.id);
    await mute(first);
    expect((await abuseTrust()).trust_score).toBe(80);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("two mutes that hit the same sender stay two entries, and lifting one keeps the sender muted", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "een", KEY);
    await submit("recipient", "twee", KEY);
    await as(R);
    const [one, two] = (await inbox()).rows;
    await mute(one!.id);
    await mute(two!.id);
    const list = await myMutes();
    expect(list).toHaveLength(2);
    await unmute(list.find((m) => m.excerpt === "een")!.id);
    await as(A);
    await submit("recipient", "drie", KEY);
    await as(R);
    expect((await inbox()).rows.map((r) => r.body)).toEqual(["een"]);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("only the recipient can list or lift their mutes, and never through the tables", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "hoi", KEY);
    await as(R);
    await mute((await inbox()).rows[0]!.id);
    const id = (await myMutes())[0]!.id;
    await as(R2);
    expect(await myMutes()).toEqual([]);
    expect(await unmute(id)).toBe(false);
    await db.exec("savepoint s");
    await expect(db.query("select id from public.qa_mute_actions")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("delete from public.shadow_mutes")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("select recipient_id from public.qa_trust_charges")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await as(R);
    expect(await myMutes()).toHaveLength(1);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("sender keys are scoped per recipient and never stored raw", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "naar r", KEY);
    await submit("second", "naar r2", KEY);
    await db.exec("reset role");
    const rows = (await db.query<{ sender_key: string; sender_acct_key: string; sender_user_id: string | null }>(
      "select sender_key, sender_acct_key, sender_user_id from public.profile_questions order by body")).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.sender_key).not.toBe(rows[1]!.sender_key);
    expect(rows[0]!.sender_acct_key).not.toBe(rows[1]!.sender_acct_key);
    for (const r of rows) {
      expect(r.sender_user_id).toBeNull();
      expect([KEY, ACCT_A]).not.toContain(r.sender_key);
      expect([KEY, ACCT_A]).not.toContain(r.sender_acct_key);
    }
  } finally { await db.exec("rollback"); }
}, 30_000);

it("a mute on the main profile never silences the same sender on the anonymous profile", async () => {
  try {
    await seed();
    await db.query("insert into public.alias_profiles(user_id, handle, display_prefs) values($1,'ralias',$2::jsonb)",
      [R, JSON.stringify({ questionsEnabled: true, qaAudience: "public_unrestricted" })]);
    await as(A);
    await submit("recipient", "root een", KEY);
    await as(R);
    await mute((await inbox()).rows[0]!.id);
    await as(A);
    expect(await submit("recipient", "root twee", KEY)).toBe("ok");
    expect(await submit("ralias", "alias een", KEY, "alias")).toBe("ok");
    await as(R);
    expect((await inbox()).rows.map((r) => r.body)).toEqual(["alias een"]);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("new questions stay invisible for a random 2-10 minutes", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "later", KEY);
    await db.exec("reset role");
    const d = (await db.query<{ s: number }>("select extract(epoch from visible_after - created_at)::float as s from public.profile_questions")).rows[0]!.s;
    expect(d).toBeGreaterThanOrEqual(120);
    expect(d).toBeLessThanOrEqual(601);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("a hidden avatar is not sent to visitors", async () => {
  try {
    await seed();
    await db.query("update public.profiles set avatar_url='/api/avatar/x.png', display_prefs=display_prefs || '{\"qaShowAvatar\":false}'::jsonb where id=$1", [R]);
    await as(null);
    const qa = (await db.query<{ qa: { avatarUrl: string | null } }>("select public.rout_qa_public('recipient','root') as qa")).rows[0]!.qa;
    expect(qa.avatarUrl).toBeNull();
  } finally { await db.exec("rollback"); }
}, 30_000);

it("daily maintenance expires abuse links, deletes old quarantine, and heals trust", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "oud", KEY);
    await db.exec("reset role");
    await db.query("update public.profile_questions set abuse_key_until = now() - interval '1 minute'");
    await db.query("insert into public.profile_questions(owner_id, body, is_quarantined, quarantine_reason, created_at) values($1,'void',true,'local_mute', now() - interval '31 days')", [R]);
    await db.query("insert into public.qa_guest_trust(sender_key, trust_score, updated_at) values($1, 60, now() - interval '8 days')", [ABUSE_A]);
    await as(R);
    await db.query("select public.rout_qa_maintenance()");
    await db.exec("reset role");
    expect((await db.query("select 1 from public.profile_questions where abuse_key is not null")).rows).toHaveLength(0);
    expect((await db.query("select 1 from public.profile_questions where body='void'")).rows).toHaveLength(0);
    expect((await abuseTrust()).trust_score).toBe(70);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("accounts under 18 get private Q&A defaults; parental consent stays under 16", async () => {
  try {
    await db.exec("begin");
    const id = "eeeeeeee-5555-4555-8555-555555555555";
    await db.query("insert into public.users(id,email,date_of_birth) values($1,'teen@example.test', current_date - interval '17 years')", [id]);
    const u = (await db.query<{ qa_permission_level: string; is_minor: boolean }>("select qa_permission_level, is_minor from public.users where id=$1", [id])).rows[0]!;
    expect(u.qa_permission_level).toBe("verified_only");
    expect(u.is_minor).toBe(false);
  } finally { await db.exec("rollback"); }
}, 30_000);
