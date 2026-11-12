/**
 * Anonymous Q&A storage (db/94 + db/0175). Server-only.
 * New questions enter only through rout_qa_submit; the runtime role cannot read
 * sender columns, so nothing here can ever return who sent a question.
 */
import { sql } from "@/lib/neon";
import { ANSWER_MAX, QUESTION_MAX, normalizeText } from "./questions-rules";
import type { QaPublic } from "./qa/types";

type Row = Record<string, unknown>;
export type QaSpace = "root" | "alias";
export type Question = {
  id: string;
  space: QaSpace;
  body: string;
  prompt: string | null;
  answer: string | null;
  published: boolean;
  styleMasked: boolean;
  /** Delivery moment truncated to the hour; never the exact send time. */
  arrivedAt: string;
  answeredAt: string | null;
  storyUntil: string | null;
};
export type { QaPublic } from "./qa/types";

const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function toQ(r: Row): Question {
  return {
    id: String(r["id"]),
    space: r["space"] === "alias" ? "alias" : "root",
    body: String(r["body"]),
    prompt: str(r["prompt"]),
    answer: str(r["answer"]),
    published: r["published"] === true,
    styleMasked: r["style_masked"] === true,
    arrivedAt: iso(r["arrived_hour"]) ?? "",
    answeredAt: iso(r["answered_at"]),
    storyUntil: iso(r["story_until"]),
  };
}

function toPublic(raw: unknown): QaPublic | null {
  const o = typeof raw === "string" ? (JSON.parse(raw) as Row) : (raw as Row | null);
  if (!o || typeof o !== "object") return null;
  const answers = Array.isArray(o["answers"]) ? (o["answers"] as Row[]) : [];
  return {
    accepting: o["accepting"] === true,
    onHub: o["onHub"] !== false,
    page: o["page"] === true,
    promptKey: str(o["promptKey"]),
    promptCustom: str(o["promptCustom"]),
    displayName: str(o["displayName"]),
    avatarUrl: str(o["avatarUrl"]),
    qaLevel: str(o["qaLevel"]),
    audience: o["audience"] === "public_unrestricted" || o["audience"] === "verified_only" ? o["audience"] : "members_only",
    showAvatar: o["showAvatar"] !== false,
    showProfileLink: o["showProfileLink"] !== false,
    designJson: o["design"] && typeof o["design"] === "object" ? JSON.stringify(o["design"]) : null,
    answers: answers.map((a) => ({
      id: String(a["id"]),
      body: String(a["body"] ?? ""),
      answer: String(a["answer"] ?? ""),
      prompt: str(a["prompt"]),
      answeredAt: iso(a["answeredAt"]) ?? "",
      storyUntil: iso(a["storyUntil"]),
    })),
  };
}

export async function publicQa(handle: string, space: QaSpace): Promise<QaPublic | null> {
  const rows = (await sql`select public.rout_qa_public(${handle}, ${space}) as qa`) as Row[];
  return toPublic(rows[0]?.["qa"]);
}

/**
 * Always "ok" for a muted or shadow-banned sender: the database quarantines
 * silently. Only keyed base hashes go in; the database scopes them to the
 * recipient canvas and never sees the device secret, account id or IP.
 */
export async function submitQuestion(input: {
  handle: string;
  space: QaSpace;
  body: string;
  deviceBase: string | null;
  accountBase: string | null;
  abuseNow: string | null;
  abusePrev: string | null;
  masked: boolean;
}): Promise<"ok" | "invalid" | "not_found"> {
  const body = normalizeText(input.body, QUESTION_MAX);
  if (!body) return "invalid";
  const rows = (await sql`select public.rout_qa_submit(${input.handle}, ${input.space}, ${body}, ${input.deviceBase}, ${input.accountBase}, ${input.abuseNow}, ${input.abusePrev}, ${input.masked}) as r`) as Row[];
  const r = rows[0]?.["r"];
  return r === "invalid" || r === "not_found" ? r : "ok";
}

/**
 * One inbox page, newest delivery first. Questions appear only after their
 * random delivery delay. The cursor is the last question id: no timestamp ever
 * travels to the browser, only the delivery hour.
 */
export async function myQuestionsPage(
  ownerId: string,
  space: QaSpace | null,
  beforeId: string | null,
  limit: number,
): Promise<{ questions: Question[]; next: string | null }> {
  const take = Math.min(Math.max(limit, 1), 100);
  const rows = (await sql`with c as (select visible_after, id from public.profile_questions where id = ${beforeId}::uuid and owner_id = ${ownerId})
       select q.id, q.space, q.body, q.prompt, q.answer, q.published, q.style_masked,
              date_trunc('hour', q.visible_after) as arrived_hour, q.answered_at, q.story_until
         from public.profile_questions q
        where q.owner_id = ${ownerId} and not q.is_quarantined and q.visible_after <= now()
          and (${space}::text is null or q.space = ${space}::text)
          and (${beforeId}::uuid is null or (q.visible_after, q.id) < (select visible_after, id from c))
        order by q.visible_after desc, q.id desc limit ${take + 1}`) as Row[];
  const questions = rows.slice(0, take).map(toQ);
  const last = questions[questions.length - 1];
  return { questions, next: rows.length > take && last ? last.id : null };
}

/** Questions delivered after the one at the top of the open inbox. */
export async function myQuestionsAfter(ownerId: string, space: QaSpace | null, afterId: string): Promise<Question[]> {
  const rows = (await sql`with c as (select visible_after, id from public.profile_questions where id = ${afterId}::uuid and owner_id = ${ownerId})
       select q.id, q.space, q.body, q.prompt, q.answer, q.published, q.style_masked,
              date_trunc('hour', q.visible_after) as arrived_hour, q.answered_at, q.story_until
         from public.profile_questions q
        where q.owner_id = ${ownerId} and not q.is_quarantined and q.visible_after <= now()
          and (${space}::text is null or q.space = ${space}::text)
          and exists (select 1 from c)
          and (q.visible_after, q.id) > (select visible_after, id from c)
        order by q.visible_after desc, q.id desc limit 50`) as Row[];
  return rows.map(toQ);
}

/** Private counts for the Insights row; computed in the database, no tracking. */
export async function myQaInsights(ownerId: string, space: QaSpace | null): Promise<{ week: number; total: number; answered: number }> {
  const rows = (await sql`select count(*) filter (where visible_after > now() - interval '7 days') as week,
                                 count(*) as total,
                                 count(*) filter (where answer is not null) as answered
                            from public.profile_questions
                           where owner_id = ${ownerId} and not is_quarantined and visible_after <= now()
                             and (${space}::text is null or space = ${space}::text)`) as Row[];
  const r = rows[0] ?? {};
  return { week: Number(r["week"] ?? 0), total: Number(r["total"] ?? 0), answered: Number(r["answered"] ?? 0) };
}

/** Publishing (re)starts a 24-hour story around the avatar. */
export async function answerQuestion(ownerId: string, id: string, raw: string, publish: boolean): Promise<"ok" | "invalid"> {
  const answer = normalizeText(raw, ANSWER_MAX);
  if (!answer) return "invalid";
  const rows=await sql`update public.profile_questions
               set answer = ${answer}, published = ${publish}, answered_at = now(),
                   story_until = case when ${publish}::boolean then now() + interval '24 hours' else null end
             where id = ${id} and owner_id = ${ownerId} returning id,space,body,is_quarantined` as Record<string,unknown>[];
  const row=rows[0];if(!row)return "invalid";
  if(publish && row["is_quarantined"]!==true){const {deliverBroadcasts}=await import("./broadcast.server");const {registerBackgroundTask}=await import("./background-task.server");
    const task=deliverBroadcasts(ownerId).catch(()=>undefined);if(!registerBackgroundTask(task))await task;}
  return "ok";
}

export async function unpublishQuestion(ownerId: string, id: string): Promise<void> {
  await sql`update public.profile_questions set published = false, story_until = null where id = ${id} and owner_id = ${ownerId}`;
}

export async function deleteQuestion(ownerId: string, id: string): Promise<void> {
  await sql`delete from public.profile_questions where id = ${id} and owner_id = ${ownerId}`;
}

/** Zero-knowledge mute: only the message id goes in; the database resolves the sender. */
export async function muteSenderByMessage(id: string, muterNet: string | null): Promise<boolean> {
  const rows = (await sql`select public.rout_qa_mute_by_message(${id}::uuid, ${muterNet}) as ok`) as Row[];
  return rows[0]?.["ok"] === true;
}

/** Daily retention, expiry and trust healing (cron). */
export async function qaMaintenance(): Promise<unknown> {
  const rows = (await sql`select public.rout_qa_maintenance() as r`) as Row[];
  return rows[0]?.["r"] ?? null;
}

export async function questionsEnabled(ownerId: string, space: QaSpace | null = null): Promise<boolean> {
  const rows = (space === "alias"
    ? await sql`select coalesce((display_prefs ->> 'questionsEnabled')::boolean, false) as on from public.alias_profiles where user_id = ${ownerId} limit 1`
    : await sql`select coalesce((display_prefs ->> 'questionsEnabled')::boolean, false) as on from public.profiles where id = ${ownerId} limit 1`) as Row[];
  return rows[0]?.["on"] === true;
}

/** Owner toggle: off hides the block and the server refuses new questions. */
export async function setQuestionsEnabled(ownerId: string, on: boolean): Promise<void> {
  const { patchProfileDraft } = await import("./profile-drafts.server");
  await patchProfileDraft(ownerId, "verified", { prefs: { questionsEnabled: on } });
}

export type QaOwner = { handle: string; displayName: string | null; avatarUrl: string | null };

/** The signed-in member's own canvases (for share cards); RLS-scoped to their rows. */
export async function myQaOwners(userId: string): Promise<Partial<Record<QaSpace, QaOwner>>> {
  const [root, alias] = await Promise.all([
    sql`select username, display_name, avatar_url from public.profiles where id = ${userId} limit 1` as Promise<Row[]>,
    (sql`select handle, display_name, avatar_url from public.alias_profiles where user_id = ${userId} limit 1` as Promise<Row[]>).catch(() => [] as Row[]),
  ]);
  const out: Partial<Record<QaSpace, QaOwner>> = {};
  const r = root[0];
  if (r && str(r["username"])) out.root = { handle: String(r["username"]), displayName: str(r["display_name"]), avatarUrl: str(r["avatar_url"]) };
  const a = alias[0];
  if (a && str(a["handle"])) out.alias = { handle: String(a["handle"]), displayName: str(a["display_name"]), avatarUrl: str(a["avatar_url"]) };
  return out;
}

/** One entry per mute the member pressed: when, and the message they muted. Never a sender. */
export type QaMute = { id: string; mutedAt: string; excerpt: string | null; space: QaSpace | null };

export async function myMutes(): Promise<QaMute[]> {
  const rows = (await sql`select id, muted_at, excerpt, space from public.rout_qa_my_mutes()`) as Row[];
  return rows.map((r) => ({
    id: String(r["id"]),
    mutedAt: iso(r["muted_at"]) ?? "",
    excerpt: str(r["excerpt"]),
    space: r["space"] === "alias" ? "alias" : r["space"] === "root" ? "root" : null,
  }));
}

/** Lifts one mute; the muted message returns to the inbox. */
export async function liftMute(id: string): Promise<boolean> {
  const rows = (await sql`select public.rout_qa_unmute(${id}::uuid) as ok`) as Row[];
  return rows[0]?.["ok"] === true;
}
