/**
 * Central transactional mailer — Infomaniak SMTP (Swiss), primary and only by default.
 *
 * Every system e-mail (sign-in codes, security notices, parental consent,
 * receipts) goes through `sendMail`. The message is built by the pure
 * `buildMimeMessage` (src/emails/mime.ts), so the privacy rules are testable:
 *   - no tracking: no pixel, no link rewriting, links stay pure https://rout.be/…
 *   - no List-Unsubscribe / List-* / Precedence / X-Campaign / X-Mailin-* headers, ever
 *   - unique cryptographic Message-ID <id@rout.be> + X-Entity-Ref-ID per mail
 *   - auth mail from auth@rout.be, system mail from system@rout.be, Reply-To hallo@rout.be
 * Optional fallback (only when FALLBACK_MAIL_API_KEY is set): a Postmark-compatible
 * HTTPS API with the same sanitation, used only on SMTP timeout/network errors.
 *
 * Never throws: a failing mail must not break a webhook or a sign-up.
 */

import { maskEmail } from "@/lib/security/redact";
import { buildMimeMessage, newMessageId, FORBIDDEN_HEADER } from "./mime";
import { sendViaSmtp, SmtpError } from "./smtp.server";
import { buildBrevoPayload, mailProvider, sendViaBrevo } from "./brevo-driver";
import { brevoKeyStatus } from "@/lib/brevo-key";
import type { EmailCategory } from "./template-ids";

export const FALLBACK_ENDPOINT = "https://api.postmarkapp.com/email";
export const MESSAGE_STREAM = "outbound";
export const AUTH_SENDER = "ROUT Authentication <auth@rout.be>";
export const SYSTEM_SENDER = "ROUT System <system@rout.be>";
export const REPLY_TO = { email: "hallo@rout.be", name: "ROUT" };
export const SMTP_TIMEOUT_MS = 4000;

type Mailbox = "auth" | "system";
export interface SmtpAccount { host: string; port: number; user: string; pass: string }

/** Reads the Infomaniak account for a mailbox; null when not configured. */
export function smtpAccount(box: Mailbox): SmtpAccount | null {
  const host = process.env["SMTP_HOST"]?.trim() || "mail.infomaniak.com";
  const port = Number(process.env["SMTP_PORT"] ?? 465);
  const user = process.env[box === "auth" ? "SMTP_USER_AUTH" : "SMTP_USER_SYSTEM"]?.trim() || `${box}@rout.be`;
  const pass = process.env[box === "auth" ? "SMTP_PASS_AUTH" : "SMTP_PASS_SYSTEM"];
  if (!pass || (port !== 465 && port !== 587)) return null;
  return { host, port, user, pass };
}

/** Categories sent from auth@rout.be; everything else uses system@rout.be. */
const SECURITY_CATEGORIES = new Set([
  "login", "recovery", "email_change", "reauthentication", "confirmation", "security", "merge", "deletion",
]);

/** Headers that would make a client treat the mail as a list or newsletter. */

export interface MailOptions {
  notificationUserId?: string;
  to: string;
  subject?: string;
  html?: string;
  text?: string;
  /** Legacy (former provider templates); ignored — every mail is rendered by us. */
  templateId?: number;
  category?: EmailCategory;
  language?: unknown;
  /** Legacy template params; only logged as a redacted summary. */
  params?: Record<string, unknown>;
  replyTo?: { email: string; name?: string };
  tags?: string[];
  attachments?: { name: string; contentBase64: string }[];
  /** Legacy flag; our rendered HTML is always the only body. */
  htmlFirst?: boolean;
  skipAdminAlert?: boolean;
  correlationId?: string;
}

export interface AdminAlertParams {
  FAILED_TEMPLATE_ID: number | string;
  USED_FALLBACK_ID: number | string;
  RECIPIENT_EMAIL: string;
  REASON: string;
}

/** Every mail is tagged transactional (+ security for auth mails); caller tags are kept. */
export function transactionalTags(category?: string, extra?: string[]): string[] {
  const tags = ["transactional"];
  if (category && SECURITY_CATEGORIES.has(category)) tags.push("security", "auth");
  if (category === "login") tags.push("otp");
  for (const t of extra ?? []) if (t && !tags.includes(t)) tags.push(t);
  return tags;
}

export function senderFor(category?: string, tags?: string[]): string {
  const auth = (category && SECURITY_CATEGORIES.has(category)) || tags?.some((t) => t === "auth" || t === "otp");
  return auth ? AUTH_SENDER : SYSTEM_SENDER;
}

function formatAddress(a: { email: string; name?: string }): string {
  const name = a.name?.replace(/["\r\n]/g, "").trim();
  return name ? `"${name}" <${a.email}>` : a.email;
}

function adminAddress(): string {
  return process.env["CONTACT_ADMIN_EMAIL"] ?? process.env["ADMIN_EMAIL"] ?? "hallo@rout.be";
}

export function isMailConfigured(): boolean {
  if (mailProvider() === "brevo") return brevoKeyStatus().key !== null;
  return smtpAccount("auth") !== null || smtpAccount("system") !== null;
}

function splitSender(sender: string): { name: string; email: string } {
  const m = /^(.*)<([^>]+)>$/.exec(sender);
  return { name: (m?.[1] ?? "").trim(), email: (m?.[2] ?? sender).trim() };
}

export function newCorrelationId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `mail_${Date.now().toString(36)}_${rand}`;
}

export function textFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "txt" ? "text/plain" : ext === "ics" ? "text/calendar" : "application/octet-stream";
}

/** Pure payload builder: the single place the privacy rules are enforced. */
export function buildPostmarkPayload(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  category?: string;
  tags?: string[];
  replyTo?: { email: string; name?: string };
  attachments?: { name: string; contentBase64: string }[];
  correlationId: string;
  extraHeaders?: Record<string, string>;
}): Record<string, unknown> {
  const headers = [{ Name: "X-Entity-Ref-ID", Value: input.correlationId }];
  for (const [Name, Value] of Object.entries(input.extraHeaders ?? {})) {
    if (!FORBIDDEN_HEADER.test(Name) && Name.toLowerCase() !== "x-entity-ref-id") headers.push({ Name, Value });
  }
  const tags = transactionalTags(input.category, input.tags);
  return {
    From: senderFor(input.category, input.tags),
    To: input.to,
    ReplyTo: formatAddress(input.replyTo ?? REPLY_TO),
    Subject: input.subject,
    HtmlBody: input.html,
    TextBody: input.text,
    // Postmark allows one tag; the most specific one wins.
    Tag: tags[tags.length - 1],
    Metadata: { category: input.category ?? "none", ref: input.correlationId },
    Headers: headers,
    TrackOpens: false,
    TrackLinks: "None",
    MessageStream: MESSAGE_STREAM,
    ...(input.attachments?.length
      ? { Attachments: input.attachments.map((f) => ({ Name: f.name, Content: f.contentBase64, ContentType: mimeFor(f.name) })) }
      : {}),
  };
}

async function postToFallback(key: string, body: Record<string, unknown>, label: string, correlationId: string, timeoutMs: number): Promise<{ sent: boolean; error?: string }> {
  try {
    const res = await fetch(process.env["FALLBACK_MAIL_API_URL"]?.trim() || FALLBACK_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "X-Postmark-Server-Token": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    if (res.ok) {
      console.info(`[Mailer] ${label} sent via fallback`, { correlationId });
      return { sent: true };
    }
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error(`[Mailer] fallback refused ${label} [${res.status}]`, { correlationId, detail });
    return { sent: false, error: `Fallback mail API refused the message (${res.status}).` };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Fallback mail API unreachable." };
  }
}

/** Log-safe view of params: keys and lengths only. */
export function summariseParams(params?: Record<string, unknown>): Record<string, string> {
  if (!params) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") { out[key] = "(empty)"; continue; }
    const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
    out[key] = SAFE_PARAM_KEYS.has(key.toUpperCase()) && /^[a-z-]{2,10}$/i.test(text) ? text : `<${text.length} chars>`;
  }
  return out;
}
const SAFE_PARAM_KEYS = new Set(["LANG", "LANGUAGE", "LOCALE"]);

const escapeHtml = (v: string) => v.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));

/** Fire-and-forget alert to the team when a mail could not be delivered. */
export function notifyAdminOfFallback(params: AdminAlertParams): void {
  void sendMail({
    to: adminAddress(),
    subject: `[ROUT] Mail niet afgeleverd (${params.FAILED_TEMPLATE_ID})`,
    category: "system",
    language: "nl",
    skipAdminAlert: true,
    tags: ["mailer-alert"],
    html:
      `<p>Een systeemmail kon niet worden afgeleverd.</p>` +
      `<p>Onderdeel: <strong>${escapeHtml(String(params.FAILED_TEMPLATE_ID))}</strong><br>` +
      `Ontvanger: ${escapeHtml(maskEmail(params.RECIPIENT_EMAIL))}<br>` +
      `Reden: ${escapeHtml(params.REASON)}</p>`,
  });
}

export async function sendMail(opts: MailOptions): Promise<{ sent: boolean; error?: string }> {
  const deadline = Date.now() + SMTP_TIMEOUT_MS;
  const remaining = () => Math.max(0, deadline - Date.now());
  if (opts.notificationUserId) {
    try {
      const { notificationMailPolicy } = await import("@/lib/email/unsubscribe.server");
      const policy = await notificationMailPolicy(opts.notificationUserId, opts.category, opts.tags);
      // Preference is honoured in-app; list headers are never attached.
      if (!policy.allowed) return { sent: false, error: "Notification email disabled by recipient." };
    } catch {
      return { sent: false, error: "Notification preference check unavailable." };
    }
  }
  const correlationId = opts.correlationId ?? newCorrelationId();
  const sender = senderFor(opts.category, opts.tags);
  const box: Mailbox = sender === AUTH_SENDER ? "auth" : "system";
  const provider = mailProvider();
  const brevoKey = provider === "brevo" ? brevoKeyStatus().key : null;
  const account = provider === "infomaniak" ? smtpAccount(box) : null;
  const fallbackKey = process.env["FALLBACK_MAIL_API_KEY"]?.trim() || null;
  if (!account && !brevoKey && !fallbackKey) {
    const msg = provider === "brevo"
      ? (brevoKeyStatus().error ?? "BREVO_API_KEY ontbreekt.")
      : `E-mailverzending is niet geconfigureerd (SMTP_PASS_${box.toUpperCase()} ontbreekt).`;
    console.error(`[Mailer] ${msg}`, { correlationId, to: maskEmail(opts.to) });
    return { sent: false, error: msg };
  }
  if (!opts.html && !opts.text) {
    console.error("[Mailer] nothing to send: no body supplied", { correlationId, category: opts.category ?? "(none)" });
    return { sent: false, error: "No body was provided for this e-mail." };
  }

  let html = opts.html ?? `<pre>${escapeHtml(opts.text ?? "")}</pre>`;
  if (!/<html[\s>]/i.test(html)) {
    const { brandHtml } = await import("./react/branded.server");
    const branded = await brandHtml(html, { language: opts.language, preview: opts.subject, ...(opts.category ? { category: opts.category } : {}) });
    if (branded) html = branded;
  }
  const text = opts.text ?? textFromHtml(html);
  const subject = opts.subject ?? "ROUT";
  const label = opts.category ?? "mail";
  console.info("[Mailer] sending", { correlationId, provider, to: maskEmail(opts.to), category: opts.category ?? "(none)", params: summariseParams(opts.params) });

  let result: { sent: boolean; error?: string } = { sent: false, error: "Mail provider not configured." };
  let transient = true;
  if (remaining() === 0) return { sent: false, error: "Mail delivery deadline exceeded." };
  if (brevoKey) {
    const payload = buildBrevoPayload({
      from: splitSender(sender), to: opts.to, replyTo: opts.replyTo ?? REPLY_TO, subject, html, text,
      messageId: newMessageId(), entityRefId: correlationId, tags: transactionalTags(opts.category, opts.tags),
      ...(opts.attachments ? { attachments: opts.attachments } : {}),
    });
    const r = await sendViaBrevo(brevoKey, payload, remaining());
    transient = r.transient;
    result = r.sent ? { sent: true } : { sent: false, error: r.error ?? "Brevo failed." };
    console[r.sent ? "info" : "error"](`[Mailer] ${label} ${r.sent ? "sent" : "failed"} via Brevo`, { correlationId, error: r.error });
  }
  if (account) {
    const from = splitSender(sender);
    const message = buildMimeMessage({
      from: { name: from.name, email: account.user },
      to: opts.to,
      replyTo: opts.replyTo ?? REPLY_TO,
      subject,
      html,
      text,
      messageId: newMessageId(),
      entityRefId: correlationId,
      ...(opts.attachments ? { attachments: opts.attachments.map((f) => ({ ...f, contentType: mimeFor(f.name) })) } : {}),
    });
    try {
      await sendViaSmtp({ ...account, timeoutMs: remaining() }, { from: account.user, to: opts.to }, message);
      console.info(`[Mailer] ${label} sent via Infomaniak SMTP`, { correlationId });
      result = { sent: true };
    } catch (error) {
      transient = !(error instanceof SmtpError) || error.transient;
      result = { sent: false, error: error instanceof Error ? error.message : "SMTP failed." };
      console.error(`[Mailer] SMTP ${label} failed`, { correlationId, transient, error: result.error });
    }
  }
  // Fallback only on timeouts/network errors, never on a definitive refusal.
  if (!result.sent && transient && fallbackKey && remaining() > 0) {
    const body = buildPostmarkPayload({
      to: opts.to, subject, html, text, correlationId,
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.tags ? { tags: opts.tags } : {}),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(opts.attachments ? { attachments: opts.attachments } : {}),
    });
    result = await postToFallback(fallbackKey, body, label, correlationId, remaining());
  }
  if (!result.sent && !opts.skipAdminAlert) {
    notifyAdminOfFallback({ FAILED_TEMPLATE_ID: label, USED_FALLBACK_ID: fallbackKey ? "fallback-api" : "none", RECIPIENT_EMAIL: opts.to, REASON: `${result.error ?? "unknown"} [${correlationId}]` });
  }
  return result;
}
