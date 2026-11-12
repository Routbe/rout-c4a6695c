/**
 * Server-only notification delivery: one in-app row + one Brevo e-mail, both
 * in the member's own language.
 *
 * Never throws: a payment webhook must not fail because a mail bounced.
 */
import {
  NOTIFICATION_EMAIL_CATEGORY,
  NOTIFICATION_SEVERITY,
  asNotificationLocale,
  escapeHtml,
  notificationCopy,
  renderNotificationEmail,
  type NotificationKind,
  type NotificationLocale,
} from "./notification-templates";
import type { EmailCategory } from "@/emails/template-ids";

function siteOrigin(): string {
  return process.env["PUBLIC_SITE_URL"] ?? "https://rout.be";
}

interface Recipient {
  email: string | null;
  locale: NotificationLocale;
}

/**
 * Preferred language + e-mail address of a member.
 *
 * Strikt: alleen het accountadres van *deze* gebruiker (public.users.email)
 * telt als geldige ontvanger. Eerdere versies vielen terug op
 * `profiles.forwarding_email` of een profielkolom die van het accountadres kon
 * afwijken — daardoor kwamen billing-mails ("Betalingsprobleem gedetecteerd")
 * bij een onbekend adres terecht. Er is nu geen enkel fallback-adres meer:
 * zonder accountadres gaat er geen mail uit, alleen de in-app melding.
 */
async function resolveRecipient(userId: string): Promise<Recipient> {
  const { dbAdmin } = await import("@/lib/db/admin.server");

  let email: string | null = null;
  let locale: NotificationLocale = "nl";

  try {
    const { data } = await dbAdmin.auth.admin.getUserById(userId);
    const account = data?.user?.email?.trim().toLowerCase() ?? null;
    email = account && account.includes("@") ? account : null;
    const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    if (meta["locale"] || meta["language"]) {
      locale = asNotificationLocale(meta["locale"] ?? meta["language"]);
    }
  } catch {
    /* geen accountrecord — in-app melding blijft staan, mail gaat niet uit */
  }

  try {
    const { data } = await dbAdmin
      .from("profiles")
      .select("locale, language" as "*")
      .eq("id", userId)
      .maybeSingle();
    const row = (data ?? null) as Record<string, unknown> | null;
    if (row?.["locale"] || row?.["language"]) {
      locale = asNotificationLocale(row["locale"] ?? row["language"]);
    }
  } catch {
    /* taalvoorkeur is optioneel */
  }

  if (!email) {
    console.error("[notifications] geen geverifieerd accountadres voor gebruiker", userId);
  }

  return { email, locale };
}

/**
 * Sends one transactional e-mail through Brevo.
 *
 * `category` + `language` pick the localized Brevo template (see
 * src/emails/template-ids.ts); `html` stays as the inline last-resort body.
 */
export async function sendTransactionalEmail(opts: {
  notificationUserId?: string;
  to: string;
  subject: string;
  html: string;
  category?: EmailCategory;
  language?: unknown;
  params?: Record<string, unknown>;
  tags?: string[];
  attachments?: { name: string; contentBase64: string }[];
  htmlFirst?: boolean;
}): Promise<boolean> {
  const { sendMail } = await import("@/emails/send.server");
  const result = await sendMail({
    ...(opts.notificationUserId ? { notificationUserId: opts.notificationUserId } : {}),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.language === undefined ? {} : { language: opts.language }),
    ...(opts.params ? { params: opts.params } : {}),
    ...(opts.tags ? { tags: opts.tags } : {}),
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    ...(opts.htmlFirst ? { htmlFirst: true } : {}),
  });
  return result.sent;
}

/** Admin-side alert (template block #1) for anything a human must pick up. */
export async function notifyAdmin(opts: {
  subject: string;
  message: string;
  params?: Record<string, unknown>;
  tags?: string[];
  attachments?: { name: string; contentBase64: string }[];
}): Promise<boolean> {
  try {
    const to = process.env["CONTACT_ADMIN_EMAIL"] ?? process.env["ADMIN_EMAIL"] ?? "hallo@rout.be";
    const { sendMail } = await import("@/emails/send.server");
    const result = await sendMail({
      to,
      subject: opts.subject,
      category: "system",
      language: "nl",
      params: { SUBJECT: opts.subject, MESSAGE: opts.message, ...(opts.params ?? {}) },
      html:
        `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#0f172a">` +
        `<h1 style="font-size:17px;margin:0 0 12px">${escapeHtml(opts.subject)}</h1>` +
        `<p style="font-size:14px;line-height:1.6;margin:0 0 16px">${escapeHtml(opts.message)}</p>` +
        (opts.params
          ? `<pre style="font:12px/1.5 ui-monospace,Menlo,monospace;background:#f8fafc;padding:12px;border-radius:10px;white-space:pre-wrap">${escapeHtml(
              JSON.stringify(opts.params, null, 2),
            )}</pre>`
          : "") +
        `</div>`,
      tags: opts.tags ?? ["admin-alert"],
    });
    return result.sent;
  } catch (error) {
    console.error("notifyAdmin failed", error);
    return false;
  }
}

/**
 * Fan-out for one member-facing event: in-app row first (that one is cheap and
 * always visible), then the localized e-mail.
 *
 * The mail is sent with the notification's Brevo *category* and the member's
 * *language*, so `sendMail` resolves the right template ID and only falls back
 * to our inline HTML when Brevo has no template for that block yet. Extra
 * `params` are merged into the Brevo template variables.
 */
export async function notifyUser(
  userId: string,
  kind: NotificationKind,
  details: Record<string, unknown> = {},
  params: Record<string, unknown> = {},
  options: { attachments?: { name: string; contentBase64: string }[] } = {},
): Promise<void> {
  if (!userId) return;
  try {
    const { email, locale } = await resolveRecipient(userId);
    const copy = notificationCopy(kind, locale);
    const category = NOTIFICATION_EMAIL_CATEGORY[kind];
    const dashboardUrl = `${siteOrigin().replace(/\/$/, "")}/dashboard`;
    const { dbAdmin } = await import("@/lib/db/admin.server");

    const { error } = await dbAdmin.from("notifications" as "profiles").insert({
      user_id: userId,
      kind,
      title: copy.title,
      body: copy.body,
      locale,
      severity: NOTIFICATION_SEVERITY[kind],
      details,
    } as never);
    if (error) console.error("notification insert failed", error);

    if (email) {
      await sendTransactionalEmail({
        notificationUserId: userId,
        to: email,
        subject: copy.subject,
        html: renderNotificationEmail(copy, dashboardUrl, locale),
        htmlFirst: true,
        category,
        language: locale,
        params: {
          KIND: kind,
          LOCALE: locale,
          SUBJECT: copy.subject,
          TITLE: copy.title,
          BODY: copy.body,
          CTA_LABEL: copy.cta,
          CTA_URL: dashboardUrl,
          DASHBOARD_URL: dashboardUrl,
          ...params,
        },
        tags: [`notification:${kind}`, `lang:${locale}`],
        ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      });
    }
  } catch (error) {
    console.error("notifyUser failed", kind, error);
  }
}
