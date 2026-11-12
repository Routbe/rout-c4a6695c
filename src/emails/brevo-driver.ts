/**
 * Brevo transactional driver (temporary, MAIL_PROVIDER=brevo).
 * Pure payload builder enforces the shared rules: unique Message-ID +
 * X-Entity-Ref-ID, no list/marketing headers, raw links (tracking params
 * like Brevo's `tracking`/link wrapping are never requested; open/click
 * tracking must also stay OFF in Brevo > Transactional > Settings).
 */
import { FORBIDDEN_HEADER } from "./mime";

export const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
export const BREVO_TRACKING_OFF = {
  "X-Mailin-Track": "0",
  "X-Mailin-Track-Opens": "0",
  "X-Mailin-Track-Clicks": "0",
  "X-Mailin-Tag": "transactional",
} as const;
export type MailProvider = "brevo" | "infomaniak";

export function mailProvider(): MailProvider {
  return process.env["MAIL_PROVIDER"]?.trim().toLowerCase() === "brevo" ? "brevo" : "infomaniak";
}

export interface BrevoPayloadInput {
  from: { name: string; email: string };
  to: string;
  replyTo: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  messageId: string;
  entityRefId: string;
  tags?: string[];
  extraHeaders?: Record<string, string>;
  attachments?: { name: string; contentBase64: string }[];
}

export function buildBrevoPayload(input: BrevoPayloadInput): Record<string, unknown> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.extraHeaders ?? {})) {
    if (!FORBIDDEN_HEADER.test(k) && !/^(message-id|x-entity-ref-id)$/i.test(k)) headers[k] = v;
  }
  // Brevo's own per-message switches (consumed by Brevo, never delivered):
  // no open pixel, no click rewriting — same as the original working setup.
  Object.assign(headers, BREVO_TRACKING_OFF);
  headers["Message-ID"] = input.messageId;
  headers["X-Entity-Ref-ID"] = input.entityRefId;
  return {
    sender: input.from,
    to: [{ email: input.to }],
    replyTo: input.replyTo,
    subject: input.subject,
    htmlContent: input.html,
    textContent: input.text,
    headers,
    ...(input.tags?.length ? { tags: input.tags.slice(0, 10) } : {}),
    ...(input.attachments?.length ? { attachment: input.attachments.map((a) => ({ name: a.name, content: a.contentBase64 })) } : {}),
  };
}

const BACKOFF_MS = [400, 1200];

/** Retry transient failures only within one shared transport deadline. */
export async function sendViaBrevo(key: string, payload: Record<string, unknown>, timeoutMs: number): Promise<{ sent: boolean; error?: string; transient: boolean }> {
  const deadline = Date.now() + timeoutMs;
  let last: { sent: boolean; error?: string; transient: boolean } = { sent: false, error: "Brevo unreachable.", transient: true };
  for (let i = 0; i < 3; i++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { sent: false, error: "Mail delivery deadline exceeded.", transient: true };
    last = await attempt(key, payload, remaining);
    if (last.sent || !last.transient) return last;
    const backoff = BACKOFF_MS[i] ?? 0;
    if (i < 2 && backoff < deadline - Date.now()) await new Promise((r) => setTimeout(r, backoff));
    else return last;
  }
  return last;
}

async function attempt(key: string, payload: Record<string, unknown>, timeoutMs: number): Promise<{ sent: boolean; error?: string; transient: boolean }> {
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "api-key": key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { sent: true, transient: false };
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return { sent: false, error: `Brevo refused the message (${res.status}): ${detail}`, transient: res.status >= 500 || res.status === 429 || res.status === 408 };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Brevo unreachable.", transient: true };
  }
}
