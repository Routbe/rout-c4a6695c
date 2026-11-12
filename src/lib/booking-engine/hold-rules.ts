/**
 * Soft-lock countdown shown while a guest fills in the form. The database is
 * the clock that counts (db/0218 holds expire server-side after 5 minutes);
 * this only renders the remaining time from the server's expiry instant.
 */
export const HOLD_MINUTES = 5;

export function holdCountdown(expiresAtIso: string, nowMs: number): { seconds: number; label: string; expired: boolean } {
  const left = Math.max(0, Math.ceil((new Date(expiresAtIso).getTime() - nowMs) / 1000));
  const m = Math.floor(left / 60), s = left % 60;
  return { seconds: left, label: `${m}:${String(s).padStart(2, "0")}`, expired: left === 0 };
}
