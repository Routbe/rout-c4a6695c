/**
 * Sends the site status mails (sign-in, developer console, subdomain).
 * Never throws and never blocks: a failing mail must not break the action.
 */
import { sql } from "@/lib/neon";
import { mailLang, type MailLang, type Rendered } from "@/emails/verification-mails";

type Row = Record<string, unknown>;
export const siteOrigin = () =>
  (process.env["PUBLIC_SITE_URL"] ?? process.env["PUBLIC_ORIGIN"] ?? "https://rout.be").replace(/\/$/, "");

export type Recipient = { email: string | null; name: string; lang: MailLang };

export async function recipient(userId: string): Promise<Recipient> {
  try {
    const rows = (await sql`
      select u.email, coalesce(p.display_name, p.username, '') as name, p.preferred_language as lang
        from public.users u left join public.profiles p on p.id = u.id where u.id = ${userId} limit 1
    `) as Row[];
    const r = rows[0] ?? {};
    return { email: (r["email"] as string | null) ?? null, name: String(r["name"] ?? "").trim(), lang: mailLang(r["lang"] ?? "nl") };
  } catch {
    return { email: null, name: "", lang: "nl" };
  }
}

export async function sendSiteMail(to: string | null, mail: Rendered, tags: string[]) {
  if (!to) return;
  try {
    const { sendMail } = await import("@/emails/send.server");
    const r = await sendMail({ to, subject: mail.subject, html: mail.html, htmlFirst: true, tags });
    if (!r.sent) console.warn(`[site-mail] not sent: ${tags.join("/")}`);
  } catch (e) {
    console.warn("[site-mail] failed", e instanceof Error ? e.message : e);
  }
}

/** Fire-and-forget wrapper for callers that must not wait. */
export function later(task: () => Promise<unknown>) {
  void task().catch((e) => console.warn("[site-mail] task failed", e instanceof Error ? e.message : e));
}

export function describeDevice(ua: string | null | undefined): string {
  const s = String(ua ?? "");
  const os = /iPhone|iPad/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Mac OS/.test(s) ? "macOS" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "";
  const br = /Edg\//.test(s) ? "Edge" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" op ") || "Onbekend toestel";
}

/** New-device sign-in notice: only when this user agent wasn't seen for this account before. */
export async function notifyNewSignIn(authUserId: string, sessionId: string, userAgent: string | null) {
  const seen = (await sql`select 1 from neon_auth.session
    where "userId" = ${authUserId} and id <> ${sessionId} and "userAgent" is not distinct from ${userAgent} limit 1`) as Row[];
  if (seen.length > 0) return;
  const first = (await sql`select 1 from neon_auth.session where "userId" = ${authUserId} and id <> ${sessionId} limit 1`) as Row[];
  if (first.length === 0) return; // very first sign-in = sign-up, no warning needed
  const u = (await sql`select email, name from neon_auth."user" where id = ${authUserId} limit 1`) as Row[];
  const email = (u[0]?.["email"] as string | null) ?? null;
  const { signInNoticeMail } = await import("@/emails/site-mails");
  const mail = signInNoticeMail({
    lang: "nl",
    name: String(u[0]?.["name"] ?? "").trim(),
    device: describeDevice(userAgent),
    when: new Date().toLocaleString("nl-BE", { timeZone: "Europe/Brussels" }),
    securityUrl: `${siteOrigin()}/dashboard`,
  });
  await sendSiteMail(email, mail, ["security", "new-sign-in"]);
}
