/**
 * ROUT card lifecycle rules (pure, browser-safe).
 *
 *  freeze    reversible, instant, no re-verification: a lost card must be killable in one tap.
 *  unfreeze  needs a fresh verification (step-up) and active 2FA.
 *  block     permanent: the card number never works again, only a replacement helps.
 *  replace   blocks the current card and issues a new number, serial and wallet key.
 *
 * Private details (back QR, live code, wallet key) are only shown during a short
 * unlock window that starts with a fresh verification, and always need active 2FA.
 */
export type CardState = "active" | "frozen" | "blocked" | "unavailable";
export type CardAction = "freeze" | "unfreeze" | "block" | "replace" | "reveal" | "claim";

/** How long the private side stays visible after one verification. */
export const CARD_UNLOCK_TTL_S = 120;
export const CARD_UNLOCK_COOKIE = "rout_card_unlock";
/** Hard cap on replacements (also enforced by the database). */
export const MAX_CARD_GENERATION = 999;

/** Re-verification needed before the action may run (freeze never waits). */
export function needsStepUp(action: CardAction): boolean {
  return action !== "freeze";
}

/** Whether an action is possible in this state; every action except freeze needs active 2FA. */
export function cardActionAllowed(action: CardAction, state: CardState, twoFactor: boolean): boolean {
  if (state === "unavailable") return false;
  if (action !== "freeze" && !twoFactor) return false;
  switch (action) {
    case "freeze":
      return state === "active";
    case "unfreeze":
      return state === "frozen";
    case "block":
      return state === "active" || state === "frozen";
    case "replace":
      return true;
    case "reveal":
    case "claim":
      return state === "active";
  }
}

/** Suffix mixed into card digests and key ids; generation 0 keeps the original numbers. */
export function generationLabel(generation: number): string {
  if (!Number.isInteger(generation) || generation < 0 || generation > MAX_CARD_GENERATION) throw new Error("invalid card generation");
  return generation === 0 ? "" : `:g${generation}`;
}

/**
 * Signed-cookie payload of an unlock window: `cu2.<user>.<issued s>.<expires s>.<card tag>`.
 * The card tag ties the window to one card number, so a replaced card never inherits it;
 * the issue time lets a later lock revoke every window opened before it.
 */
export function cardUnlockPayload(userId: string, issuedAtSec: number, expiresAtSec: number, cardTag: string): string {
  return `cu2.${userId}.${issuedAtSec}.${expiresAtSec}.${cardTag}`;
}

export type CardUnlockClaims = { issuedAtSec: number; expiresAtSec: number; cardTag: string };

/** Claims when the payload belongs to this user and is still open, else null. */
export function checkCardUnlockPayload(payload: string, userId: string, nowSec: number): CardUnlockClaims | null {
  const parts = payload.split(".");
  if (parts.length !== 5 || parts[0] !== "cu2" || parts[1] !== userId) return null;
  const iat = Number(parts[2]);
  const exp = Number(parts[3]);
  const tag = parts[4]!;
  if (!/^[0-9a-f]{16}$/.test(tag)) return null;
  if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)) return null;
  if (iat > nowSec + 5 || exp <= nowSec || exp > iat + CARD_UNLOCK_TTL_S || exp > nowSec + CARD_UNLOCK_TTL_S + 5) return null;
  return { issuedAtSec: iat, expiresAtSec: exp, cardTag: tag };
}

/** The window closes 5 minutes after the verification itself, not after the click that used it. */
export function cardUnlockExpiry(verifiedAtSec: number, nowSec: number): number | null {
  const exp = verifiedAtSec + CARD_UNLOCK_TTL_S;
  return exp > nowSec ? Math.min(exp, nowSec + CARD_UNLOCK_TTL_S) : null;
}
