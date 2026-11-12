/** Pure inbox helpers shared by the Void Inbox and its tests. */

export type InboxFilter = "all" | "open" | "answered";
export const INBOX_PAGE_SIZE = 50;
/** Seconds a deleted question can still be restored before the database delete runs. */
export const UNDO_DELETE_MS = 5000;
/** How often an open, visible inbox asks for new arrivals. */
export const INBOX_SYNC_MS = 15000;

type Item = { id: string; answer: string | null };

export function filterInbox<T extends Item>(items: readonly T[], filter: InboxFilter, hidden: ReadonlySet<string>): T[] {
  return items.filter((i) => !hidden.has(i.id) && (filter === "all" || (filter === "open" ? !i.answer : Boolean(i.answer))));
}

/** Prepend new arrivals, dropping any id that is already listed. */
export function mergeNewest<T extends { id: string }>(fresh: readonly T[], existing: readonly T[]): T[] {
  const seen = new Set(existing.map((i) => i.id));
  return [...fresh.filter((i) => !seen.has(i.id)), ...existing];
}

/** Whole-percent answer ratio; null when there is nothing to answer yet. */
export function answerRatio(answered: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round((Math.min(Math.max(answered, 0), total) / total) * 100);
}
