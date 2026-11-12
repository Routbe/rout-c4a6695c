/**
 * Bounded, ordered cleanup of expired rows (assets, QR-shared files).
 *
 * Rows are taken oldest-expiry first in keyset batches; a row whose object
 * cannot be deleted stays in the database (retried next run) but is skipped
 * for the rest of this run, so a few broken objects can never starve the
 * queue. The run stops at the time budget and reports whether work remains.
 */
export type ExpiredRow = { id: string; expiresAt: string };
export type DrainCursor = { expiresAt: string; id: string } | null;

export async function drainExpired<R extends ExpiredRow>(opts: {
  fetchBatch: (cursor: DrainCursor, limit: number) => Promise<R[]>;
  remove: (row: R) => Promise<void>;
  batchSize: number;
  budgetMs?: number;
  now?: () => number;
}): Promise<{ removed: number; failed: number; more: boolean }> {
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.budgetMs ?? 20_000);
  let cursor: DrainCursor = null;
  let removed = 0;
  let failed = 0;
  for (;;) {
    const rows = await opts.fetchBatch(cursor, opts.batchSize);
    for (const row of rows) {
      if (now() >= deadline) return { removed, failed, more: true };
      try {
        await opts.remove(row);
        removed++;
      } catch {
        failed++;
      }
      cursor = { expiresAt: row.expiresAt, id: row.id };
    }
    if (rows.length < opts.batchSize) return { removed, failed, more: false };
    if (now() >= deadline) return { removed, failed, more: true };
  }
}
