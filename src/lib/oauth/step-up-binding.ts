/**
 * Pure rules for "Login met ROUT" step-up proofs (no I/O).
 *
 * A proof (e-mail OTP or passkey assertion) is bound to ONE authorization
 * request of ONE client: the request id is derived server-side from the
 * authorize parameters, so a proof for one request cannot unlock another.
 */
import { STEP_UP_MAX_ATTEMPTS, type StepUpState } from "./step-up";

/** OTPs, passkey challenges and verified proofs are valid for at most 5 minutes. */
export const STEP_UP_TTL_SEC = 300;
export const OTP_HASH_PREFIX = "v2$";
export const OTP_KEY_LABEL = "rout/oauth-step-up-otp/v2";

export type AuthorizeBinding = {
  clientId: string;
  redirectUri: string;
  state?: string | null;
  nonce?: string | null;
  codeChallenge: string;
};

/** Canonical, order-stable text the request id is hashed from. */
export function bindingText(b: AuthorizeBinding): string {
  return JSON.stringify([b.clientId, b.redirectUri, b.state ?? null, b.nonce ?? null, b.codeChallenge]);
}

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const x of new Uint8Array(bytes)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Stable id of one authorization request (SHA-256, base64url). */
export async function authorizationRequestId(b: AuthorizeBinding): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bindingText(b))));
}

/** HKDF-SHA256 derived key from an existing server secret; never a newly generated secret. */
export async function deriveOtpKey(serverSecret: string): Promise<CryptoKey> {
  if (!serverSecret || serverSecret.length < 16) throw new Error("step_up_secret_missing");
  const ikm = await crypto.subtle.importKey("raw", new TextEncoder().encode(serverSecret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(OTP_KEY_LABEL) },
    ikm,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

/** `v2$` + HMAC-SHA256(key, userId:clientId:requestId:code): useless to a database reader. */
export async function otpHash(key: CryptoKey, userId: string, clientId: string, requestId: string, code: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}:${clientId}:${requestId}:${code.trim()}`));
  return `${OTP_HASH_PREFIX}${b64url(mac)}`;
}

/**
 * Outcome of the single conditional UPDATE in verifyStepUpCode.
 * `updated`: the row the UPDATE returned (null = no row matched the guard);
 * `row`: the pre-update snapshot of the newest open code (null = none).
 */
export function classifyVerify(
  updated: { ok: boolean } | null,
  row: { attempts: number; expiresAt: string } | null,
  now: number,
): StepUpState {
  if (updated) return updated.ok ? "ok" : "wrong";
  if (!row) return "missing";
  if (Date.parse(row.expiresAt) <= now) return "expired";
  if (row.attempts >= STEP_UP_MAX_ATTEMPTS) return "locked";
  return "missing";
}

/** A challenge is usable once, before it expires. */
export function challengeUsable(c: { expiresAt: string; consumedAt: string | null } | null, now: number): boolean {
  return Boolean(c && !c.consumedAt && Date.parse(c.expiresAt) > now);
}

function fromB64url(s: string): string {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(p + "=".repeat((4 - (p.length % 4)) % 4));
}

/**
 * Pre-check of the WebAuthn clientDataJSON before signature verification:
 * type, exact challenge and exact origin. The library re-checks all of this
 * together with RP ID hash, UP/UV flags, signature and counter.
 */
export function checkClientData(
  clientDataJSONb64url: string,
  expected: { challenge: string; origin: string },
): { ok: true } | { ok: false; reason: "malformed" | "type" | "challenge" | "origin" } {
  let data: { type?: string; challenge?: string; origin?: string };
  try {
    data = JSON.parse(fromB64url(clientDataJSONb64url));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (data.type !== "webauthn.get") return { ok: false, reason: "type" };
  if (data.challenge !== expected.challenge) return { ok: false, reason: "challenge" };
  if (data.origin !== expected.origin) return { ok: false, reason: "origin" };
  return { ok: true };
}

/** A signature counter must grow, unless the authenticator does not count (both 0). */
export function counterAccepted(stored: number, received: number): boolean {
  if (stored === 0 && received === 0) return true;
  return received > stored;
}
