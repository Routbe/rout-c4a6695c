/**
 * Applies an approve/reject decision from a signed admin e-mail link.
 * Only runs after the confirmation page POSTs — opening the link never changes anything.
 */
import { sql } from "@/lib/neon";
import { verifyReviewToken, type ReviewPayload } from "./review-links.server";

type Row = Record<string, unknown>;
const OPEN = new Set(["pending", "incomplete"]);

async function load(p: ReviewPayload): Promise<Row | null> {
  const rows = (p.k === "influencer"
    ? await sql`select r.*, u.email, pr.username, pr.display_name, coalesce(pr.total_reach_count, 0) as reach
        from public.influencer_requests r join public.users u on u.id = r.user_id
        left join public.profiles pr on pr.id = r.user_id where r.id = ${p.r} limit 1`
    : await sql`select r.*, u.email, pr.username, pr.display_name, 0 as reach
        from public.business_verifications r join public.users u on u.id = r.user_id
        left join public.profiles pr on pr.id = r.user_id where r.id = ${p.r} limit 1`) as Row[];
  return rows[0] ?? null;
}

export async function previewReview(token: string) {
  const p = await verifyReviewToken(token);
  if (!p) return { ok: false as const, reason: "invalid" as const };
  const r = await load(p);
  if (!r) return { ok: false as const, reason: "not_found" as const };
  const { CREATOR_MIN_REACH, isCreatorEligible } = await import("./creator-eligibility");
  const reach = Number(r["reach"] ?? 0);
  return {
    ok: true as const,
    kind: p.k,
    action: p.a,
    open: OPEN.has(String(r["status"])),
    status: String(r["status"]),
    applicant: String(r["display_name"] ?? r["username"] ?? r["email"] ?? "—"),
    handle: (r["username"] as string | null) ?? null,
    subject:
      p.k === "influencer"
        ? ((r["handle_choices"] as string[] | null) ?? []).join(", ")
        : [r["company_name"], r["website_domain"]].filter(Boolean).join(" · "),
    reach: p.k === "influencer" ? reach : null,
    belowReach: p.k === "influencer" && !isCreatorEligible(reach),
    minReach: CREATOR_MIN_REACH,
  };
}

async function reviewerId(): Promise<string> {
  const rows = (await sql`select user_id from public.user_roles where role::text = 'admin' order by user_id limit 1`) as Row[];
  return (rows[0]?.["user_id"] as string | undefined) ?? (null as unknown as string);
}

export async function confirmReview(token: string, note: string | null) {
  const p = await verifyReviewToken(token);
  if (!p) return { ok: false as const, reason: "Deze link is ongeldig of verlopen." };
  const r = await load(p);
  if (!r) return { ok: false as const, reason: "Aanvraag niet gevonden." };
  if (!OPEN.has(String(r["status"]))) return { ok: false as const, reason: "Deze aanvraag is al afgehandeld." };
  const admin = await reviewerId();
  const userId = r["user_id"] as string;

  if (p.a === "approve") {
    if (p.k === "influencer") {
      const { isCreatorEligible } = await import("./creator-eligibility");
      if (!isCreatorEligible(Number(r["reach"] ?? 0))) {
        return { ok: false as const, reason: "Onder de 10.000 volgers — goedkeuren kan niet." };
      }
    }
    const proposed = p.k === "influencer"
      ? ((r["handle_choices"] as string[] | null) ?? [])
      : [String(r["website_domain"] ?? ""), String(r["company_name"] ?? "")].filter(Boolean);
    const { approveWithWhitelist } = await import("./approved-handles.server");
    const res = await approveWithWhitelist(p.k, p.r, admin, proposed);
    return res.ok ? { ok: true as const, done: "approved" as const } : { ok: false as const, reason: res.reason };
  }

  const srv = await import("./verification-requests.server");
  if (p.k === "influencer") await srv.rejectInfluencerRequest(p.r, admin, note);
  else await srv.rejectBusinessRequest(p.r, admin, note);
  const { notifyRejected } = await import("./approved-handles.server");
  await notifyRejected(userId, p.k, note);
  return { ok: true as const, done: "rejected" as const };
}
