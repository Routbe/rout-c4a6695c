/** Availability older than this is recomputed on the visitor's request (Vercel Hobby crons run only daily). */
export const AVAILABILITY_MAX_AGE_MS = 5 * 60 * 1000;
export const LAZY_RECOMPUTE_MAX_HOSTS = 5;

export function isAvailabilityStale(computedAt: string | Date | null, now = new Date()): boolean {
  if (!computedAt) return true;
  const t = new Date(computedAt).getTime();
  return !Number.isFinite(t) || now.getTime() - t > AVAILABILITY_MAX_AGE_MS;
}
