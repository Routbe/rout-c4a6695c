/**
 * Anti-bot handle claiming (`identity:handle_reservation`). Pure and browser-safe.
 * An external app may adopt the member's ROUT @handle as its own username without
 * building its own anti-squatting system: ROUT only vouches for a root handle of an
 * active, e-mail-confirmed, unbanned account that is unique in ROUT.
 */

export const HANDLE_RESERVATION_SCOPE = "identity:handle_reservation";
export const HANDLE_RESERVATION_CLAIM = "rout_handle_reservation";
/** Per member per app; one sign-in uses two (id_token + userinfo). */
export const HANDLE_RESERVATION_RATE = { limit: 30, windowSec: 3600 } as const;

export type HandleReservationStatus = "reserved" | "unavailable" | "rate_limited";
export type HandleReservationClaim = {
  status: HandleReservationStatus;
  handle?: string;
  verified_human: boolean;
  issued_at: number;
  /** base64url(SHA-256("rout-hr-v1|client_id|sub|handle")): store it next to the username to detect a mismatched record. */
  binding?: string;
};

export type ReservationFacts = {
  handle: unknown;
  accountActive: boolean;
  emailConfirmed: boolean;
  banned: boolean;
  shadowbanned: boolean;
  /** How many ROUT profiles hold this handle (case-insensitive); must be exactly 1. */
  holders: number;
};

const HANDLE_FORMAT = /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/i;

/** Integrity check: the handle is vouched for only when every condition holds. */
export function reservableHandle(f: ReservationFacts): string | null {
  if (typeof f.handle !== "string" || !HANDLE_FORMAT.test(f.handle)) return null;
  if (!f.accountActive || !f.emailConfirmed || f.banned || f.shadowbanned) return null;
  if (f.holders !== 1) return null;
  return f.handle.toLowerCase();
}

export function bindingInput(clientId: string, sub: string, handle: string): string {
  return `rout-hr-v1|${clientId}|${sub}|${handle.toLowerCase()}`;
}

export async function reservationBinding(clientId: string, sub: string, handle: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bindingInput(clientId, sub, handle)));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function buildReservationClaim(input: {
  clientId: string;
  sub: string;
  facts: ReservationFacts | null;
  verifiedHuman: boolean;
  rateLimited: boolean;
  nowSec: number;
}): Promise<HandleReservationClaim> {
  const base = { verified_human: input.verifiedHuman, issued_at: input.nowSec };
  if (input.rateLimited) return { status: "rate_limited", ...base };
  const handle = input.facts ? reservableHandle(input.facts) : null;
  if (!handle) return { status: "unavailable", ...base };
  return { status: "reserved", handle, ...base, binding: await reservationBinding(input.clientId, input.sub, handle) };
}
