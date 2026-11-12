/**
 * Pure rules for the "Login met ROUT" signing keys: which key signs, which keys
 * are published in the JWKS, when a key rotates and which token headers are
 * accepted. No I/O, so every rule is unit-tested.
 */

export const SIGNING_ALG = "ES256" as const;

/** A sealed key signs for at most this long before a new one takes over. */
export const KEY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * A retired key stays in the JWKS this long, so tokens it signed keep
 * verifying. Must exceed the longest token lifetime (access_token_ttl max 24 h).
 */
export const RETIRED_KEY_GRACE_MS = 48 * 60 * 60 * 1000;

export type KeyStorage = "sealed" | "legacy_plaintext" | "none";

export type SigningKeyMeta = {
  kid: string;
  createdAt: Date;
  retiredAt: Date | null;
  revokedAt: Date | null;
  storage: KeyStorage;
  /** Fingerprint of the key-encryption key that sealed the private part. */
  kekFingerprint: string | null;
};

/**
 * A key sealed under another KEK is replaced only when it is at least this old.
 * A younger one means two deployments use different KEKs on one database; they
 * must not keep replacing each other's key.
 */
export const KEK_SWITCH_MIN_AGE_MS = 60 * 60 * 1000;

export type RotationReason = "missing" | "expired" | "kek_changed" | "kek_conflict";

/** Newest usable key: not retired, not revoked, with a private part. */
export function activeSigningKey<T extends SigningKeyMeta>(keys: readonly T[]): T | null {
  const usable = keys
    .filter((k) => !k.retiredAt && !k.revokedAt && k.storage !== "none")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return usable[0] ?? null;
}

/**
 * Why a new key must be generated now, or null. A legacy plaintext key is not
 * rotated here: sealing it is an explicit step (scripts/seal-signing-keys.ts)
 * because older deployments can only read plaintext keys.
 */
export function rotationReason(
  active: SigningKeyMeta | null,
  currentKekFingerprint: string,
  now: Date,
): RotationReason | null {
  if (!active) return "missing";
  if (active.storage === "legacy_plaintext") return null;
  if (now.getTime() - active.createdAt.getTime() >= KEY_MAX_AGE_MS) return "expired";
  if (active.kekFingerprint !== currentKekFingerprint) {
    return now.getTime() - active.createdAt.getTime() >= KEK_SWITCH_MIN_AGE_MS ? "kek_changed" : "kek_conflict";
  }
  return null;
}

/** Keys whose public half belongs in the JWKS. */
export function publishedKeys<T extends SigningKeyMeta>(keys: readonly T[], now: Date): T[] {
  return keys.filter(
    (k) => !k.revokedAt && (!k.retiredAt || now.getTime() - k.retiredAt.getTime() < RETIRED_KEY_GRACE_MS),
  );
}

/** Retired keys past the grace period whose private part must be wiped. */
export function privatePartsToWipe(keys: readonly SigningKeyMeta[], now: Date): string[] {
  return keys
    .filter(
      (k) =>
        k.storage !== "none" &&
        ((k.revokedAt !== null) || (k.retiredAt !== null && now.getTime() - k.retiredAt.getTime() >= RETIRED_KEY_GRACE_MS)),
    )
    .map((k) => k.kid);
}

export type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };

/**
 * The key that may verify a token with this header, or null (= reject).
 * Only ES256, only an exact `kid` among the published keys: an unknown or
 * missing `kid` is never matched to "some other" key.
 */
export function verificationKidFor(
  header: JwtHeader,
  keys: readonly SigningKeyMeta[],
  now: Date,
): string | null {
  if (header.alg !== SIGNING_ALG) return null;
  if (typeof header.kid !== "string" || header.kid.length === 0) return null;
  const kid = header.kid;
  return publishedKeys(keys, now).some((k) => k.kid === kid) ? kid : null;
}
