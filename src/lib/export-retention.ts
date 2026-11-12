/**
 * Retention / cost control for generated CSV exports.
 *
 * Export files are assembled in the browser from server chunks and never
 * stored in the database or a bucket — that keeps storage cost at zero. What
 * still needs discipline is memory and runaway background work, so every job
 * carries a hard timeout and every finished file self-expires.
 */

/** A background export must finish inside this window or it is aborted. */
export const EXPORT_JOB_TIMEOUT_MS = 2 * 60 * 1000;

/** A generated file stays downloadable for this long, then it is discarded. */
export const EXPORT_RETENTION_MS = 10 * 60 * 1000;

/** Never keep more than this many rows in memory for one export. */
export const EXPORT_MAX_ROWS = 50_000;

export function expiresAt(startedAt: number = Date.now()): number {
  return startedAt + EXPORT_RETENTION_MS;
}

export function isExpired(expiry: number | undefined, now: number = Date.now()): boolean {
  return typeof expiry === "number" && now >= expiry;
}

export function retentionLabel(): string {
  return `Files are kept for ${Math.round(EXPORT_RETENTION_MS / 60000)} minutes, then discarded automatically.`;
}
