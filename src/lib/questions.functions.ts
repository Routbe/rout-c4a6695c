import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalAuth, requireAuth } from "@/lib/auth/middleware";
import { ANSWER_MAX, QA_DEVICE_COOKIE, QA_DEVICE_COOKIE_DAYS, QUESTION_MAX, QUESTION_RATE, QUESTION_RATE_HOURLY, QUESTION_RATE_RECIPIENT } from "./questions-rules";

const handle = z.string().trim().regex(/^@?[A-Za-z0-9._-]{1,64}$/).transform((h) => h.replace(/^@/, ""));
const space = z.enum(["root", "alias"]).default("root");

/** Public: Q&A settings + answered questions of a public profile (never the owner id). */
export const getQaPublic = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ handle, space }).parse(input))
  .handler(async ({ data }) => {
    const s = await import("./questions.server");
    try {
      return { qa: await s.publicQa(data.handle, data.space) };
    } catch (e) {
      console.error("[questions] public failed", e instanceof Error ? e.message : e);
      return { qa: null };
    }
  });

/** Public: who may send a question to this profile (minors default to verified accounts only). */
export const getQuestionAccess = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .inputValidator((input: unknown) => z.object({ handle, space }).parse(input))
  .handler(async ({ data, context }) => questionAccess(data.handle, data.space, context.userId));

async function questionAccess(h: string, sp: "root" | "alias", userId: string | null) {
  const { canSendQuestion, isQaLevel } = await import("./minor-safety");
  const s = await import("./questions.server");
  const qa = await s.publicQa(h, sp).catch(() => null);
  const raw = qa?.qaLevel;
  const { stricterQaLevel } = await import("./minor-safety");
  const level = !qa || !qa.accepting ? ("disabled" as const) : stricterQaLevel(isQaLevel(raw) ? raw : "public_unrestricted", qa.audience);
  let verified = false;
  if (userId && level === "verified_only") {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`select coalesce(verified, false) as v from public.profiles where id = ${userId} limit 1`) as Record<string, unknown>[];
    verified = rows[0]?.["v"] === true;
  }
  return { level, canSend: canSendQuestion(level, { signedIn: Boolean(userId), verified }) };
}

/**
 * Per-device secret (HttpOnly __Host- cookie, 90 days) so a recipient can mute
 * an anonymous sender. The secret itself is never stored: only keyed hashes
 * derived from it, scoped to one recipient canvas by the database.
 */
async function deviceSecret(): Promise<string> {
  const { getCookie, setCookie } = await import("@tanstack/react-start/server");
  let sid = getCookie(QA_DEVICE_COOKIE);
  if (!sid || !/^[A-Za-z0-9_-]{32,64}$/.test(sid)) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    sid = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    setCookie(QA_DEVICE_COOKIE, sid, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: QA_DEVICE_COOKIE_DAYS * 86_400 });
  }
  return sid;
}

type AskResult = "ok" | "invalid" | "not_found" | "restricted" | "too_many" | "bot" | "unavailable";

/**
 * Public send. Muted or shadow-banned senders get the same "ok" as everybody:
 * the database quarantines their message silently. Every answer — delivered,
 * quarantined or refused — is padded to the same duration (constant-time), so
 * response timing cannot reveal a mute. Ghost Mode happens before sending
 * (magic wand → /api/ai/rewrite); `ghost` only labels a wand message.
 */
export const askAnonymousQuestion = createServerFn({ method: "POST" })
  .middleware([optionalAuth])
  .inputValidator((input: unknown) =>
    z.object({
      handle,
      space,
      body: z.string().max(QUESTION_MAX * 2),
      ghost: z.boolean().default(false),
      altcha: z.string().max(4000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("questions");
    const { constantTime } = await import("./qa/privacy-keys");
    const result = await constantTime<AskResult>(() => sendQuestion(data, context.userId), "unavailable");
    return { result, masked: result === "ok" && data.ghost };
  });

async function sendQuestion(
  data: { handle: string; space: "root" | "alias"; body: string; ghost: boolean; altcha?: string | null },
  userId: string | null,
): Promise<AskResult> {
  const access = await questionAccess(data.handle, data.space, userId);
  if (access.level === "disabled") return "not_found";
  if (!access.canSend) return "restricted";
  const keys = await import("./qa/privacy-keys.server");
  if (!keys.hasPrivacySecret()) return "unavailable";
  const { verifyAltcha } = await import("./altcha.server");
  if (!(await verifyAltcha(data.altcha ?? null)).ok) return "bot";
  const { getRequest } = await import("@tanstack/react-start/server");
  const { clientIp, hitRateLimit } = await import("@/lib/rate-limit-db.server");
  const ip = clientIp(getRequest());
  const minute = await hitRateLimit("question-ask", ip, QUESTION_RATE, { failClosed: true });
  const hour = minute.ok ? await hitRateLimit("question-ask-hour", ip, QUESTION_RATE_HOURLY, { failClosed: true }) : minute;
  const recipient = hour.ok
    ? await hitRateLimit("question-recipient", `${data.space}:${data.handle.toLowerCase()}`, QUESTION_RATE_RECIPIENT, { failClosed: true })
    : hour;
  if (!minute.ok || !hour.ok || !recipient.ok) return "too_many";
  const { normalizeText } = await import("./questions-rules");
  const body = normalizeText(data.body, QUESTION_MAX);
  if (!body) return "invalid";
  const sid = await deviceSecret().catch(() => null);
  const [base, abuse] = await Promise.all([keys.senderBaseKeys(sid, userId), keys.abuseKeys(sid, userId)]);
  const s = await import("./questions.server");
  return s.submitQuestion({
    handle: data.handle,
    space: data.space,
    body,
    deviceBase: base.device,
    accountBase: base.account,
    abuseNow: abuse.now,
    abusePrev: abuse.prev,
    masked: data.ghost,
  });
}

const cursor = z.string().uuid();
const inboxSpace = z.enum(["root", "alias"]).nullable().default(null);

/** One keyset page of the owner's inbox (newest first). */
export const getMyQuestions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ space: inboxSpace, before: cursor.nullable().default(null), limit: z.number().int().min(1).max(100).default(50) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    try {
      const [page, enabled] = await Promise.all([
        s.myQuestionsPage(context.userId, data.space, data.before, data.limit),
        s.questionsEnabled(context.userId, data.space),
      ]);
      return { ready: true, enabled, questions: page.questions, next: page.next };
    } catch (e) {
      console.error("[questions] inbox failed", e instanceof Error ? e.message : e);
      return { ready: false, enabled: false, questions: [] as Awaited<ReturnType<typeof s.myQuestionsPage>>["questions"], next: null };
    }
  });

/** New arrivals after the newest question the open inbox already shows. */
export const getMyNewQuestions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ space: inboxSpace, after: cursor }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    try {
      return { questions: await s.myQuestionsAfter(context.userId, data.space, data.after) };
    } catch {
      return { questions: [] as Awaited<ReturnType<typeof s.myQuestionsAfter>> };
    }
  });

/** Private Insights: questions this week and answer ratio, from plain counts. */
export const getMyQaInsights = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ space: inboxSpace }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    try {
      return { ready: true, ...(await s.myQaInsights(context.userId, data.space)) };
    } catch {
      return { ready: false, week: 0, total: 0, answered: 0 };
    }
  });

const idSchema = z.object({ id: z.string().uuid() });

export const answerMyQuestion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.extend({ answer: z.string().max(ANSWER_MAX * 2), publish: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    return { result: await s.answerQuestion(context.userId, data.id, data.answer, data.publish) };
  });

/** Zero-knowledge mute: the payload is the message id only, never a user id. */
export const muteSenderOfQuestion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.strict().parse(input))
  .handler(async ({ data }) => {
    const s = await import("./questions.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIp } = await import("@/lib/rate-limit-db.server");
    const { muterNetKey } = await import("./qa/privacy-keys.server");
    const net = await muterNetKey(clientIp(getRequest())).catch(() => null);
    return { ok: await s.muteSenderByMessage(data.id, net) };
  });

export const unpublishMyQuestion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    await s.unpublishQuestion(context.userId, data.id);
    return { ok: true };
  });

export const deleteMyQuestion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    await s.deleteQuestion(context.userId, data.id);
    return { ok: true };
  });

export const setMyQuestionsEnabled = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    await s.setQuestionsEnabled(context.userId, data.enabled);
    return { ok: true };
  });

/** Own handles + avatars per canvas, used to render share cards from the inbox. */
export const getMyQaOwners = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await import("./questions.server");
    try {
      return { owners: await s.myQaOwners(context.userId) };
    } catch {
      return { owners: {} };
    }
  });

/** The member's own mutes (time + muted message only). */
export const getMyMutes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const s = await import("./questions.server");
    try {
      return { ready: true, mutes: await s.myMutes() };
    } catch (e) {
      console.error("[questions] mutes failed", e instanceof Error ? e.message : e);
      return { ready: false, mutes: [] as Awaited<ReturnType<typeof s.myMutes>> };
    }
  });

export const liftMyMute = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.strict().parse(input))
  .handler(async ({ data }) => {
    const s = await import("./questions.server");
    return { ok: await s.liftMute(data.id) };
  });

/** Owner: switch the /ask page on immediately (from the share widget prompt). */
export const enableMyAskPage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { publishAskPageOn } = await import("./profile-drafts.server");
    await publishAskPageOn(context.userId);
    return { ok: true };
  });
