/**
 * Short unlock window for the private side of the ROUT card (back QR, live code,
 * wallet key). Opened only right after a fresh verification, proven by an
 * HMAC-signed HttpOnly cookie bound to the member and to the current card number.
 * Every read re-checks that the card is still active and that 2FA is still on;
 * lock/freeze/block/replace also revoke every window opened before, server-side.
 */
import { hmacSha256Hex } from "@/lib/audit-chain";
import { CARD_UNLOCK_COOKIE, CARD_UNLOCK_TTL_S, cardUnlockExpiry, cardUnlockPayload, checkCardUnlockPayload, type CardUnlockClaims } from "./card-lifecycle";

async function secret(): Promise<string> {
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const s = resolveAuthSecret();
  if (!s) throw new Error("auth secret missing");
  return `card-unlock:${s.secret}`;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** One-way tag of a card serial, so the cookie never carries the serial itself. */
export async function cardUnlockTag(serial: string): Promise<string> {
  return (await hmacSha256Hex(await secret(), `tag:${serial}`)).slice(0, 16);
}

/** Claims of a valid cookie value for this member, else null. Exported for tests. */
export async function verifyCardUnlockCookie(raw: string | null | undefined, userId: string, nowMs = Date.now()): Promise<CardUnlockClaims | null> {
  if (!raw || raw.length > 300) return null;
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const payload = raw.slice(0, i);
  if (!safeEqual(raw.slice(i + 1), await hmacSha256Hex(await secret(), payload))) return null;
  return checkCardUnlockPayload(payload, userId, Math.floor(nowMs / 1000));
}

export async function signCardUnlock(userId: string, serial: string, verifiedAtSec: number, nowMs = Date.now()): Promise<{ value: string; expiresAt: number } | null> {
  const now = Math.floor(nowMs / 1000);
  const exp = cardUnlockExpiry(verifiedAtSec, now);
  if (exp === null) return null;
  const payload = cardUnlockPayload(userId, now, exp, await cardUnlockTag(serial));
  return { value: `${payload}.${await hmacSha256Hex(await secret(), payload)}`, expiresAt: exp * 1000 };
}

/** Opens the window (call only with the proof from ensureStepUpProof). Returns its expiry in ms. */
export async function openCardUnlock(userId: string, serial: string, verifiedAtSec: number): Promise<number> {
  const signed = await signCardUnlock(userId, serial, verifiedAtSec);
  if (!signed) {
    const { StepUpRequiredError } = await import("@/lib/auth/step-up.server");
    throw new StepUpRequiredError();
  }
  const { writeResponseCookie } = await import("@/lib/request-context");
  writeResponseCookie(CARD_UNLOCK_COOKIE, signed.value, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: CARD_UNLOCK_TTL_S });
  const { recordSecurityEvent } = await import("@/lib/audit-log.server");
  void recordSecurityEvent({ eventType: "card.unlocked", userId, payload: {} });
  return signed.expiresAt;
}

/** Last server-side revocation (ms); windows issued at or before it are dead. Errors fail closed. */
async function unlockRevokedAt(userId: string): Promise<number> {
  const { sql } = await import("@/lib/neon");
  const rows = await sql`select (display_prefs->'cardSecurity'->>'unlockRevokedAt')::bigint as at from public.profiles where id = ${userId} limit 1`;
  const at = Number(rows[0]?.["at"] ?? 0);
  return Number.isFinite(at) && at > 0 ? at : 0;
}

/**
 * Expiry (ms) of an open window, else null. Fails closed: the card must still be
 * the same active card, 2FA must still be on and no lock may have happened since.
 */
export async function cardUnlockedUntil(userId: string): Promise<number | null> {
  const { readRequestCookie } = await import("@/lib/request-context");
  const claims = await verifyCardUnlockCookie(readRequestCookie(CARD_UNLOCK_COOKIE), userId);
  if (!claims) return null;
  try {
    const { myRootCard, memberHasTwoFactor } = await import("./card-owner.server");
    const [mine, twoFactor, revokedAt] = await Promise.all([myRootCard(userId), memberHasTwoFactor(userId), unlockRevokedAt(userId)]);
    if (!mine || mine.state !== "active" || !twoFactor) return null;
    if (claims.issuedAtSec * 1000 <= revokedAt) return null;
    if (!safeEqual(claims.cardTag, await cardUnlockTag(mine.card.serial))) return null;
    return claims.expiresAtSec * 1000;
  } catch {
    return null;
  }
}

/** Closes the window here and revokes every window of this member opened until now. */
export async function closeCardUnlock(userId: string): Promise<void> {
  const { clearResponseCookie } = await import("@/lib/request-context");
  clearResponseCookie(CARD_UNLOCK_COOKIE, { path: "/" });
  try {
    const { sql } = await import("@/lib/neon");
    // +1 s: a window signed in this same second must not survive the lock.
    const at = Date.now() + 1000;
    await sql`update public.profiles
      set display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb), '{cardSecurity}',
        coalesce(display_prefs->'cardSecurity', '{}'::jsonb) || jsonb_build_object('unlockRevokedAt', ${at}::bigint), true)
      where id = ${userId}`;
  } catch {
    console.error("[card] unlock revocation could not be stored");
  }
}
