import { createHmac, timingSafeEqual } from "node:crypto";

/** Accept/decline links stay valid for 14 days. */
export const BOOKING_TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;

/** Server-only signing key; refuses short or missing secrets (no fallbacks). */
export function bookingSigningSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env["BOOKING_SIGNING_SECRET"] ?? env["BOOKING_TOKEN_SECRET"] ?? env["BETTER_AUTH_SECRET"];
  if (!s || s.length < 32) throw new Error("BOOKING_SIGNING_SECRET missing or too short");
  return s;
}

type Action = "accept" | "decline";
const mac = (secret: string, id: string, action: Action, exp: number) =>
  createHmac("sha256", secret).update(`booking:v2:${id}:${action}:${exp}`).digest("hex");

export function signBookingToken(secret: string, id: string, action: Action, nowSec = Math.floor(Date.now() / 1000)): string {
  const exp = nowSec + BOOKING_TOKEN_TTL_SECONDS;
  return `${exp}.${mac(secret, id, action, exp)}`;
}

export function checkBookingToken(secret: string, id: string, action: Action, token: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(token ?? "");
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp < nowSec) return false;
  const expected = Buffer.from(mac(secret, id, action, exp));
  const given = Buffer.from(m[2]!);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
