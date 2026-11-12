/**
 * Sends the creator / business verification mails (applicant + admin review).
 * Never throws: a failing mail must not break a request or a decision.
 */
import { sql } from "@/lib/neon";
import {
  adminReviewMail,
  approvedMail,
  mailLang,
  receivedMail,
  rejectedMail,
  type VerifyKind,
} from "@/emails/verification-mails";

type Row = Record<string, unknown>;

const origin = () =>
  (process.env["PUBLIC_SITE_URL"] ?? process.env["PUBLIC_ORIGIN"] ?? "https://rout.be").replace(/\/$/, "");
const adminTo = () => process.env["CONTACT_ADMIN_EMAIL"] ?? process.env["ADMIN_EMAIL"] ?? "hallo@rout.be";

async function member(userId: string) {
  const rows = (await sql`
    select u.email, p.username, p.display_name, p.preferred_language, coalesce(p.total_reach_count, 0) as reach
      from public.users u left join public.profiles p on p.id = u.id
     where u.id = ${userId} limit 1
  `.catch(async () =>
    sql`select u.email, p.username, p.display_name, null as preferred_language, 0 as reach
          from public.users u left join public.profiles p on p.id = u.id where u.id = ${userId} limit 1`,
  )) as Row[];
  const r = rows[0] ?? {};
  return {
    email: (r["email"] as string | null) ?? null,
    handle: (r["username"] as string | null) ?? null,
    name: ((r["display_name"] as string | null) ?? (r["username"] as string | null) ?? "").trim(),
    lang: mailLang(r["preferred_language"] ?? "nl"),
    reach: Number(r["reach"] ?? 0),
  };
}

async function send(to: string, subject: string, html: string, tags: string[]) {
  try {
    const { sendMail } = await import("@/emails/send.server");
    const r = await sendMail({ to, subject, html, htmlFirst: true, tags });
    if (!r.sent) console.warn(`[verification-mail] not sent: ${subject}`);
  } catch (e) {
    console.warn("[verification-mail] failed", e instanceof Error ? e.message : e);
  }
}

export async function sendRequestReceived(userId: string, kind: VerifyKind, requestId: string) {
  const m = await member(userId);
  if (m.email) {
    const mail = receivedMail({ lang: m.lang, kind, name: m.name, dashboardUrl: `${origin()}/dashboard` });
    await send(m.email, mail.subject, mail.html, ["verification", "received"]);
  }
  await sendAdminReview(userId, kind, requestId, m);
}

async function sendAdminReview(userId: string, kind: VerifyKind, requestId: string, m: Awaited<ReturnType<typeof member>>) {
  try {
    const { signReviewToken } = await import("./review-links.server");
    const { CREATOR_MIN_REACH, isCreatorEligible } = await import("./creator-eligibility");
    const rows = (kind === "influencer"
      ? await sql`select * from public.influencer_requests where id = ${requestId} limit 1`
      : await sql`select * from public.business_verifications where id = ${requestId} limit 1`) as Row[];
    const r = rows[0];
    if (!r) return;
    const fields: Array<[string, unknown]> =
      kind === "influencer"
        ? [
            ["Gewenste namen", ((r["handle_choices"] as string[] | null) ?? []).join(", ")],
            ["Sociale links", ((r["social_links"] as string[] | null) ?? []).join("\n")],
            ["Totaal bereik", m.reach.toLocaleString("nl-BE")],
            ["Status", r["status"] === "awaiting_payment" ? "Wacht op betaling (€ 70)" : "Klaar om te beoordelen"],
          ]
        : [
            ["Bedrijf", r["company_name"]],
            ["Rechtsvorm", r["legal_form"]],
            ["Btw-nummer", r["vat_number"]],
            ["Domein", r["website_domain"]],
            ["Adres", [r["address"], r["country"]].filter(Boolean).join(", ")],
            ["Contact", [r["contact_name"], r["contact_email"]].filter(Boolean).join(" · ")],
          ];
    const link = async (a: "approve" | "reject") =>
      `${origin()}/review/${await signReviewToken({ k: kind, r: requestId, a })}`;
    const mail = adminReviewMail({
      kind,
      applicant: { name: m.name || "—", handle: m.handle, email: m.email },
      fields,
      motivation: (r["motivation"] as string | null) ?? null,
      approveUrl: await link("approve"),
      rejectUrl: await link("reject"),
      adminUrl: `${origin()}/admin/verifications?request=${requestId}`,
      warning:
        kind === "influencer" && !isCreatorEligible(m.reach)
          ? `Bereik onder de ${CREATOR_MIN_REACH.toLocaleString("nl-BE")} volgers volgens de gekoppelde accounts.`
          : null,
    });
    await send(adminTo(), mail.subject, mail.html, ["verification", "admin-review"]);
  } catch (e) {
    console.warn("[verification-mail] admin review failed", e instanceof Error ? e.message : e);
  }
}

export async function sendDecision(
  userId: string,
  kind: VerifyKind,
  decision: { approved: true; handle: string | null } | { approved: false; reason: string | null },
) {
  const m = await member(userId);
  if (!m.email) return;
  const dashboardUrl = `${origin()}/dashboard`;
  const mail = decision.approved
    ? approvedMail({
        lang: m.lang,
        kind,
        name: m.name,
        handle: decision.handle ?? m.handle,
        profileUrl: (decision.handle ?? m.handle) ? `${origin()}/${decision.handle ?? m.handle}` : null,
        dashboardUrl,
      })
    : rejectedMail({ lang: m.lang, kind, name: m.name, reason: decision.reason, dashboardUrl });
  await send(m.email, mail.subject, mail.html, ["verification", decision.approved ? "approved" : "rejected"]);
}
