/**
 * Pure MIME builder for ROUT transactional mail (no I/O, fully testable).
 *
 * Guarantees enforced here, for every transport:
 *   - no list/marketing headers (List-*, Precedence, X-Campaign, X-Mailin-*, Feedback-ID)
 *   - a fresh cryptographic Message-ID <id@rout.be> and X-Entity-Ref-ID per mail
 *   - bodies are encoded as-is: no tracking pixel, no link rewriting
 *   - CR/LF can never be injected into a header
 */

export const FORBIDDEN_HEADER = /^(list-|precedence$|x-mailin-|x-campaign|feedback-id$)/i;
const RESERVED_HEADER = /^(from|to|reply-to|subject|date|message-id|mime-version|content-type|content-transfer-encoding|x-entity-ref-id)$/i;

export interface MimeInput {
  from: { name: string; email: string };
  to: string;
  replyTo: { name?: string; email: string };
  subject: string;
  html: string;
  text: string;
  messageId: string;
  entityRefId: string;
  date?: Date;
  extraHeaders?: Record<string, string>;
  attachments?: { name: string; contentBase64: string; contentType: string }[];
}

const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

/** RFC 2047 encoded-word when the value is not plain ASCII. */
export function encodeHeaderWord(value: string): string {
  const v = clean(value);
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  return `=?UTF-8?B?${b64(v)}?=`;
}

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const wrap76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n").trimEnd();

function address(a: { name?: string; email: string }): string {
  const email = clean(a.email);
  if (!/^[^\s@<>"]+@[^\s@<>"]+$/.test(email)) throw new Error("Invalid e-mail address in header.");
  const name = a.name ? clean(a.name).replace(/"/g, "") : "";
  if (!name) return `<${email}>`;
  return /^[\x20-\x7e]*$/.test(name) ? `"${name}" <${email}>` : `${encodeHeaderWord(name)} <${email}>`;
}

/** Cryptographic id usable in Message-ID / X-Entity-Ref-ID. */
export function cryptoId(bytes = 18): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, bytes * 2);
}

export function newMessageId(domain = "rout.be"): string {
  return `<${cryptoId()}@${domain}>`;
}

/** Returns the headers that will actually be written (useful for tests). */
export function buildHeaders(input: MimeInput): [string, string][] {
  const headers: [string, string][] = [
    ["From", address(input.from)],
    ["To", address({ email: input.to })],
    ["Reply-To", address(input.replyTo)],
    ["Subject", encodeHeaderWord(input.subject)],
    ["Date", (input.date ?? new Date()).toUTCString().replace("GMT", "+0000")],
    ["Message-ID", clean(input.messageId)],
    ["X-Entity-Ref-ID", clean(input.entityRefId)],
    ["MIME-Version", "1.0"],
  ];
  for (const [name, value] of Object.entries(input.extraHeaders ?? {})) {
    if (!/^[A-Za-z0-9-]+$/.test(name) || FORBIDDEN_HEADER.test(name) || RESERVED_HEADER.test(name)) continue;
    headers.push([name, clean(value)]);
  }
  return headers;
}

/** Full RFC 5322 message with CRLF line endings. */
export function buildMimeMessage(input: MimeInput): string {
  const boundary = `rout_${cryptoId(12)}`;
  const alt = `alt_${cryptoId(12)}`;
  const lines = buildHeaders(input).map(([n, v]) => `${n}: ${v}`);
  const altPart = [
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(input.text)),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(input.html)),
    `--${alt}--`,
  ];
  if (!input.attachments?.length) {
    return [...lines, `Content-Type: multipart/alternative; boundary="${alt}"`, "", ...altPart, ""].join("\r\n");
  }
  const parts = [`--${boundary}`, `Content-Type: multipart/alternative; boundary="${alt}"`, "", ...altPart];
  for (const f of input.attachments) {
    const name = clean(f.name).replace(/"/g, "");
    parts.push(
      `--${boundary}`,
      `Content-Type: ${f.contentType}; name="${name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${name}"`,
      "",
      wrap76(f.contentBase64.replace(/\s+/g, "")),
    );
  }
  parts.push(`--${boundary}--`);
  return [...lines, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts, ""].join("\r\n");
}

/** SMTP DATA dot-stuffing (RFC 5321 §4.5.2). */
export function dotStuff(message: string): string {
  return message.replace(/\r\n\./g, "\r\n..").replace(/^\./, "..");
}
