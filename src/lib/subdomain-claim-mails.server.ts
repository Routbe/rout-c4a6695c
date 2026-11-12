/** Subdomain-claim mails (admin + member) via the shared MailAdapter (`sendMail`). Server-only. */
import { escapeMailParam } from "@/lib/mail-param-escape";

export type ClaimMailStatus = "sent" | "failed" | "failed_brevo_key" | "failed_network";
export interface ClaimMailResult { status: ClaimMailStatus; error: string | null }

async function send(to: string, subject: string, html: string): Promise<ClaimMailResult> {
  const { sendMail, isMailConfigured } = await import("@/emails/send.server");
  if (!isMailConfigured()) return { status: "failed_brevo_key", error: "Mail provider not configured" };
  try {
    const r = await sendMail({ to, subject, html, category: "system", tags: ["subdomain-claim"] });
    return r.sent ? { status: "sent", error: null } : { status: "failed", error: r.error ?? "unknown" };
  } catch (e) {
    return { status: "failed_network", error: e instanceof Error ? e.message : "network error" };
  }
}

export async function sendClaimMails(input: {
  subdomain: string;
  userName: string;
  userEmail: string | null;
}): Promise<{ admin: ClaimMailResult; user: ClaimMailResult }> {
  const sub = escapeMailParam(input.subdomain);
  const name = escapeMailParam(input.userName);
  const cname = escapeMailParam(input.subdomain.replace(/\.rout\.be$/, ""));
  const adminEmail = process.env["ADMIN_EMAIL"] ?? "admin@rout.be";
  const [admin, user] = await Promise.all([
    send(
      adminEmail,
      `Nieuwe subdomeinclaim: ${input.subdomain}`,
      `<p>Nieuwe claim voor <strong>${sub}</strong>.</p><p>Lid: ${name} (${escapeMailParam(input.userEmail ?? "")})<br>CNAME: <code>${cname}</code> → cname.vercel-dns.com</p>`,
    ),
    input.userEmail
      ? send(
          input.userEmail,
          `Je adres ${input.subdomain} wordt klaargezet`,
          `<p>Hallo ${name},</p><p>We zetten <strong>${sub}</strong> voor je klaar. Zodra de DNS actief is, staat je profiel daar live. Je krijgt geen verdere actie van ons nodig.</p>`,
        )
      : Promise.resolve<ClaimMailResult>({ status: "failed", error: "no member email" }),
  ]);
  return { admin, user };
}
