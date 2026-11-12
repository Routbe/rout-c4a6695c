/** Pure retentieregels voor de Asset Manager (getest in asset-retention.test.ts). */
export const FREE_DEFAULT_DAYS = 7;
export const FREE_MAX_DAYS = 90;
export const LIFETIME_MAX_FILES = 50;
export const LIFETIME_MAX_BYTES = 500 * 1024 * 1024;

export interface Tier {
  verified: boolean;
  isPro: boolean;
}

export const isLifetimeTier = (t: Tier) => t.verified || t.isPro;

/** Free: 1..90 dagen (standaard 7). Pro/Verified: permanent (null). */
export function retentionFor(tier: Tier, requestedDays?: number | null, now = Date.now()) {
  if (isLifetimeTier(tier)) return { isLifetime: true, expiresAt: null as Date | null };
  const raw = Number.isFinite(requestedDays) ? Math.floor(requestedDays as number) : FREE_DEFAULT_DAYS;
  const days = Math.min(FREE_MAX_DAYS, Math.max(1, raw));
  return { isLifetime: false, expiresAt: new Date(now + days * 86_400_000) };
}

/** Mag er nog een bestand bij? Limiet: 50 bestanden of 500 MB totaal. */
export function withinQuota(used: { files: number; bytes: number }, addBytes: number): boolean {
  return used.files + 1 <= LIFETIME_MAX_FILES && used.bytes + addBytes <= LIFETIME_MAX_BYTES;
}

export function assetStatus(expiresAt: string | Date | null, isLifetime: boolean, now = Date.now()) {
  if (isLifetime || !expiresAt) return { daysRemaining: null as number | null, isExpired: false };
  const ms = new Date(expiresAt).getTime() - now;
  return { daysRemaining: Math.max(0, Math.ceil(ms / 86_400_000)), isExpired: ms <= 0 };
}
