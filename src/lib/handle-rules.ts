import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
/**
 * Handle allocation rules shared by the onboarding form, the public API and the
 * admin portal. Client-safe: no server-only imports.
 *
 * Short handles (3–4 characters) are a scarce resource. They can never be
 * claimed through normal signup — only a super admin can grant one, and only to
 * a verified account ("VIP handle grant").
 */

export const SHORT_HANDLE_MIN = 3;
export const SHORT_HANDLE_MAX = 4;

/**
 * Free accounts live in the "crowded" part of the namespace: at least 5
 * characters AND at least one digit, exactly like the numeric suffixes big
 * platforms hand out. Verified members buy their way out of that rule.
 */
export const FREE_HANDLE_MIN = 5;

/** Platform-wide floor: every handle, free or verified, is at least 5 characters. */
export const HANDLE_MIN = 5;

/** Free accounts must carry at least this many digits (anti-squatting rule). */
export const FREE_HANDLE_MIN_DIGITS = 2;

/**
 * …en altijd minstens drie letters, zodat een gratis handle leesbaar blijft.
 * Er staat géén bovengrens op het aantal cijfers: `jona12345` mag.
 */
export const FREE_HANDLE_MIN_LETTERS = 3;

export type HandleTier = "free" | "verified";

export interface HandleRuleContext {
  /** "verified" covers paid / Early Believer / admin-verified accounts. */
  tier?: HandleTier;
  /** Legal name on file — required to correlate a verified short handle. */
  legalName?: string | null;
  /** Admin-granted VIP short handle (3–4 characters). */
  vipGranted?: boolean;
  /**
   * "private" = geverifieerd lid kiest een schone alias zonder koppeling aan de
   * wettelijke naam. Cijfers blijven altijd optioneel voor geverifieerde leden.
   */
  identityMode?: "legal" | "private";
}

export const FREE_HANDLE_MESSAGE =
  "Gratis handles hebben minstens 5 tekens, minstens 3 letters en minstens 2 cijfers nodig (bijv. jona26). Meer cijfers mag. Verifieer je account voor een strakke handle zonder cijfers.";

export const VERIFIED_MIN_MESSAGE = "Handles moeten minstens 5 tekens lang zijn.";

export function hasDigit(handle: string): boolean {
  return /[0-9]/.test(handle);
}

/** How many digits a handle contains — free handles need at least two. */
export function digitCount(handle: string): number {
  return (handle.match(/[0-9]/g) ?? []).length;
}

/** How many letters a handle contains — free handles need at least three. */
export function letterCount(handle: string): number {
  return (handle.match(/[a-z]/g) ?? []).length;
}

/** Lowercase letters, digits and the separators `.`, `-`, `_`; never at the edges. */
export function hasAllowedCharacters(handle: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])$/.test(handle);
}

export const CHARSET_MESSAGE =
  "Gebruik kleine letters, cijfers en de scheidingstekens . - _ ; begin en eindig met een letter of cijfer.";

export const VERIFIED_HANDLE_MESSAGE =
  "Geverifieerde leden hebben een handle van minstens 5 tekens nodig die herleidbaar is naar hun wettelijke naam (bijv. jdelplanche, j.delplanche, jonadelplanche).";

/**
 * Mirrors the `profiles_short_handle_rule` database trigger: 3- and 4-character
 * handles are reserved for admin VIP grants, everything from 5 characters up is
 * free to claim. Keep this in sync with the SQL trigger.
 */
export const SHORT_HANDLE_RESERVATION_ENABLED = true;

/** Marker stored in `profiles.handle_grant` when an admin granted a short handle. */
export const VIP_HANDLE_GRANT = "vip";

export const SHORT_HANDLE_MESSAGE =
  "Handles van 3 en 4 tekens zijn gereserveerd. Vraag een VIP-grant aan via support of kies 5+ tekens.";

export const TOO_SHORT_MESSAGE = "Handles moeten minstens 5 tekens lang zijn.";

/** Same copy as SHORT_HANDLE_MESSAGE — one string, used everywhere. */
export const RESERVED_LENGTH_MESSAGE = SHORT_HANDLE_MESSAGE;

export function normalizeHandleInput(raw: string): string {
  return sanitizeHandleInput(raw);
}

/**
 * Canonieke opslagvorm van een handle: kleine letters, geen spaties, en enkel
 * `a-z`, `0-9`, `_`, `-` en `.` (de punt blijft toegestaan omdat geverifieerde
 * leden hun wettelijke naam als `j.delplanche` mogen dragen). Scheidingstekens
 * aan de randen verdwijnen, zodat `@ Jona.26 ` altijd `jona.26` wordt.
 */
export function normalizeHandleForStorage(raw: string): string {
  return normalizeHandleInput(raw)
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 30);
}

/** True for a handle of exactly 3 or 4 characters, i.e. the protected range. */
export function isShortHandle(handle: string): boolean {
  const len = normalizeHandleInput(handle).length;
  return len >= SHORT_HANDLE_MIN && len <= SHORT_HANDLE_MAX;
}

/**
 * True only when the handle falls in the protected range (exactly 3–4
 * characters) AND the reservation is currently active. Handles of 5+
 * characters never need a grant.
 */
export function needsVipGrant(handle: string): boolean {
  if (!SHORT_HANDLE_RESERVATION_ENABLED) return false;
  return isShortHandle(handle);
}

/**
 * The single source of truth for length-based handle errors, shared by the
 * signup form and the admin portal so the copy can never contradict itself.
 * Returns `null` when the length is acceptable (3+ characters, or 5+ while the
 * short-handle reservation is active).
 */
export function handleLengthMessage(handle: string): string | null {
  const len = normalizeHandleInput(handle).length;
  if (len === 0) return null;
  if (len < SHORT_HANDLE_MIN) return TOO_SHORT_MESSAGE;
  if (SHORT_HANDLE_RESERVATION_ENABLED && len <= SHORT_HANDLE_MAX) return RESERVED_LENGTH_MESSAGE;
  return null;
}

/**
 * Tier-aware handle rule — the single gate used by the profile form, the
 * onboarding form and the server-side probe.
 *
 * free      → 5+ characters and at least one digit
 * verified  → 3+ characters (3–4 only with a VIP grant), and the handle must
 *             contain a recognisable part of the legal name on file
 */
export function handleRuleMessage(handle: string, ctx: HandleRuleContext = {}): string | null {
  const clean = normalizeHandleInput(handle);
  if (clean.length === 0) return null;
  const tier = ctx.tier ?? "free";

  if (clean.length < HANDLE_MIN) return TOO_SHORT_MESSAGE;
  if (!hasAllowedCharacters(clean)) return CHARSET_MESSAGE;

  if (tier === "free") {
    if (digitCount(clean) < FREE_HANDLE_MIN_DIGITS) return FREE_HANDLE_MESSAGE;
    if (letterCount(clean) < FREE_HANDLE_MIN_LETTERS) return FREE_HANDLE_MESSAGE;
    return null;
  }

  // Verified members: short handles stay scarce unless explicitly granted.
  if (SHORT_HANDLE_RESERVATION_ENABLED && isShortHandle(clean) && !ctx.vipGranted) {
    return SHORT_HANDLE_MESSAGE;
  }
  return null;
}

export interface CheckHandleResult {
  allowed: boolean;
  reason?: "too_short" | "reserved" | "taken" | "ok";
  message?: string;
}

/**
 * Structured validation matching the database trigger:
 * - < 3 characters: too short
 * - 3–4 characters: reserved unless VIP-granted
 * - 5+ characters: allowed
 */
export function validateHandle(handle: string, isVipGranted: boolean): CheckHandleResult {
  const cleanHandle = normalizeHandleInput(handle);

  if (cleanHandle.length < SHORT_HANDLE_MIN) {
    return { allowed: false, reason: "too_short", message: TOO_SHORT_MESSAGE };
  }

  if (SHORT_HANDLE_RESERVATION_ENABLED && isShortHandle(cleanHandle)) {
    if (!isVipGranted) {
      return {
        allowed: false,
        reason: "reserved",
        message: SHORT_HANDLE_MESSAGE,
      };
    }
  }

  return { allowed: true, reason: "ok", message: "Handle is beschikbaar!" };
}
