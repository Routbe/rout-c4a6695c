/** Pure rules for phone verification codes (shared by server and tests). */
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;

/** E.164: "+" country code, 8–15 digits total. Returns null when invalid. */
export function normalizePhone(countryCode: string, number: string): string | null {
  const cc = countryCode.replace(/[^\d]/g, "");
  let local = number.replace(/[^\d]/g, "");
  if (!cc || cc.length > 3) return null;
  if (local.startsWith("00")) return null;
  if (local.startsWith("0")) local = local.slice(1);
  const full = `+${cc}${local}`;
  return /^\+[1-9]\d{7,14}$/.test(full) ? full : null;
}

export function maskPhone(last4: string): string {
  return `•••• ${last4}`;
}

/** Uniform 6-digit code via rejection sampling. */
export function generateOtp(): string {
  const max = 4_000_000_000; // multiple of 1e6 below 2^32
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= max);
  return String(buf[0]! % 1_000_000).padStart(OTP_LENGTH, "0");
}

export type OtpState = { expiresAt: number; attempts: number; consumed: boolean };
export type OtpOutcome = "ok" | "expired" | "too_many_attempts" | "invalid" | "consumed";

/** `attempts` = failed attempts already recorded before this one. */
export function evaluateOtp(state: OtpState, nowMs: number, matches: boolean): OtpOutcome {
  if (state.consumed) return "consumed";
  if (nowMs >= state.expiresAt) return "expired";
  if (state.attempts >= OTP_MAX_ATTEMPTS) return "too_many_attempts";
  return matches ? "ok" : "invalid";
}

/** Automatic outbound SMS only for Belgian numbers (free via own gateway). */
export const AUTO_SMS_PREFIX = "+32";
export const INBOUND_VERIFY_LINE = "+32 486 35 31 11";
export function usesAutoSms(e164: string): boolean {
  return e164.startsWith(AUTO_SMS_PREFIX);
}
