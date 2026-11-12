/** Back-channel email sync: pure rules (URL safety, event shape, HMAC signature, bulk plan). */

export const EMAIL_UPDATED_EVENT = "https://schemas.rout.be/events/user-email-updated";

/** https only, no credentials, no IP literals in private/loopback/link-local ranges, no localhost. */
export function webhookUrlAllowed(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d+$/.test(host)) return false; // decimal-encoded IPv4
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (host.includes(":")) {
    // Any IPv6 literal that is loopback, unspecified, ULA, link-local or IPv4-mapped is refused.
    if (host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:")) return false;
    return true;
  }
  return host.includes(".");
}

export type EmailUpdatedEvent = {
  event: typeof EMAIL_UPDATED_EVENT;
  sub: string;
  previous_email: string | null;
  new_email: string;
  updated_at: number;
};

export function emailUpdatedEvent(sub: string, previous: string | null, next: string, nowSec: number): EmailUpdatedEvent {
  return { event: EMAIL_UPDATED_EVENT, sub, previous_email: previous, new_email: next, updated_at: nowSec };
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `X-Rout-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">`. */
export async function signWebhook(secret: string, body: string, nowSec: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${nowSec}.${body}`));
  return `t=${nowSec},v1=${hex(sig)}`;
}

export type AssignmentRow = { clientId: string; source: string; assignedEmail: string };
export type BulkChange = { clientId: string; previousEmail: string; newEmail: string };

/**
 * Apps to move to the new primary address: only the selected ones, only when the
 * address actually changes. A private relay is never replaced by the real address.
 */
export function planBulkEmailUpdate(rows: AssignmentRow[], selected: string[], newEmail: string): BulkChange[] {
  const pick = new Set(selected);
  const target = newEmail.trim().toLowerCase();
  return rows
    .filter((r) => pick.has(r.clientId) && r.source !== "relay" && r.assignedEmail.toLowerCase() !== target)
    .map((r) => ({ clientId: r.clientId, previousEmail: r.assignedEmail, newEmail: newEmail.trim() }));
}

/** Apps still holding an address that differs from the current primary (wizard trigger). */
export function staleAssignments(rows: AssignmentRow[], primary: string | null): AssignmentRow[] {
  if (!primary) return [];
  const p = primary.toLowerCase();
  return rows.filter((r) => r.source !== "relay" && r.assignedEmail.toLowerCase() !== p);
}
