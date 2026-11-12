/** Self-service account deletion: pure timing rules (7-day grace). */
export const DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type DeletionRow = { requestedAt: number; purgeAfter: number; cancelledAt: number | null; completedAt: number | null };

export function purgeAfter(requestedAt: number): number {
  return requestedAt + DELETION_GRACE_MS;
}

export function isPending(row: DeletionRow | null): boolean {
  return !!row && row.cancelledAt === null && row.completedAt === null;
}

/** The member can cancel at any moment during the grace period, never after the purge. */
export function canCancel(row: DeletionRow | null, now: number): boolean {
  return isPending(row) && now < row!.purgeAfter;
}

export function isDue(row: DeletionRow | null, now: number): boolean {
  return isPending(row) && now >= row!.purgeAfter;
}
