/**
 * Temporary, signed action links for human-in-the-loop answers.
 * `/act?t=<ticket>` carries only a target path and an expiry, signed with
 * HMAC-SHA256. It holds no credential: the target still requires sign-in.
 * Pure (WebCrypto only), so the signer and the verifier share one format.
 */

export const ACTION_TICKET_TTL_S = 15 * 60;

/** Only these in-app destinations can be reached through an action ticket. */
const ALLOWED_TARGETS = [/^\/dashboard(\/[a-z0-9/_-]*)?(\?[a-z0-9=&_-]*)?$/i, /^\/studio(\/account)?(\?[a-z0-9=&_-]*)?$/i];

export function isAllowedActionTarget(path: string): boolean {
  return ALLOWED_TARGETS.some((re) => re.test(path));
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(`rout-action-ticket:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signActionTicket(secret: string, target: string, nowS: number, ttlS = ACTION_TICKET_TTL_S): Promise<{ ticket: string; expiresAt: string }> {
  if (!isAllowedActionTarget(target)) throw new Error("action_target_not_allowed");
  const exp = nowS + ttlS;
  const body = b64url(enc.encode(JSON.stringify({ p: target, e: exp })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return { ticket: `${body}.${b64url(sig)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export type TicketCheck = { ok: true; target: string } | { ok: false; reason: "invalid" | "expired" };

export async function verifyActionTicket(secret: string, ticket: string, nowS: number): Promise<TicketCheck> {
  const [body, sig] = ticket.split(".");
  if (!body || !sig || ticket.length > 1024) return { ok: false, reason: "invalid" };
  let valid = false;
  try {
    valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig) as BufferSource, enc.encode(body) as BufferSource);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "invalid" };
  let parsed: { p?: unknown; e?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromB64url(body))) as { p?: unknown; e?: unknown };
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof parsed.p !== "string" || typeof parsed.e !== "number" || !isAllowedActionTarget(parsed.p)) return { ok: false, reason: "invalid" };
  if (parsed.e <= nowS) return { ok: false, reason: "expired" };
  return { ok: true, target: parsed.p };
}
