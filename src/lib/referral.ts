/**
 * Referral capture — client-safe.
 *
 * A visitor arriving on `rout.be/r/<handle>` is tagged with the inviter's
 * handle. The tag survives the whole sign-up detour (e-mail confirmation,
 * Referral attribution is in-memory only, never persistent visitor storage.
 * Reloads/OAuth round-trips intentionally discard attribution.
 */

export const REFERRAL_KEY = "rout_invited_by";
/** Oudere sleutel — blijft leesbaar zodat lopende uitnodigingen niet sneuvelen. */
export const LEGACY_REFERRAL_KEY = "rout_ref";
export const REFERRAL_TTL_DAYS = 30;
let currentReferrer: string | null = null;

export function referralPath(username: string): string {
  return `/r/${username.replace(/^@/, "").toLowerCase()}`;
}

export function referralUrl(username: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "https://rout.be");
  return `${base}${referralPath(username)}`;
}

/**
 * Normaliseert een `ref`-code naar de databasehandle: `u_jona` (gratis lid) en
 * `jona` (Pro) verwijzen naar dezelfde inviter.
 */
export function normalizeReferralCode(raw: string): string {
  return raw.replace(/^@/, "").replace(/^u_/i, "").trim().toLowerCase();
}

/** First tag wins for this page lifetime only; no tracking cookie or localStorage. */
export function storeReferrer(username: string): void {
  const handle = normalizeReferralCode(username);
  if (!handle) return;
  if (currentReferrer || typeof window === "undefined") return;
  currentReferrer = handle;
}

/**
 * Leest `?ref=` zonder persistente attributie. Wordt op
 * `/`, `/signup` en de referral-landingspagina aangeroepen.
 */
export function captureReferralFromUrl(search?: string): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(search ?? window.location.search);
  const ref = params.get("ref");
  if (!ref) return null;
  const handle = normalizeReferralCode(ref);
  if (!handle) return null;
  storeReferrer(handle);
  return handle;
}

export function readReferrer(): string | null {
  return typeof window === "undefined" ? null : currentReferrer;
}

export function clearReferrer(): void {
  currentReferrer = null;
  for (const key of [REFERRAL_KEY, LEGACY_REFERRAL_KEY]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.cookie = `${key}=; path=/; max-age=0; SameSite=Lax`;
    }
  }
}
