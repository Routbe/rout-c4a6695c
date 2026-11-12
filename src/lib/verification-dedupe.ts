/** Open statuses that count as "still waiting for an admin". */
export const OPEN_VERIFICATION_STATUSES = ["pending", "incomplete"] as const;

export function isOpenStatus(status: unknown): boolean {
  return typeof status === "string" && (OPEN_VERIFICATION_STATUSES as readonly string[]).includes(status);
}

/** Group key: same user + same category (tier). */
export function dedupeKey(r: { userId: string; tier: string }): string {
  return `${r.userId}::${r.tier}`;
}

/** Ids of other open requests that should close when `approvedId` is approved. */
export function siblingsToClose<T extends { paymentId: string; userId: string; tier: string; status: string }>(
  rows: T[],
  approvedId: string,
): string[] {
  const target = rows.find((r) => r.paymentId === approvedId);
  if (!target) return [];
  const key = dedupeKey(target);
  return rows
    .filter((r) => r.paymentId !== approvedId && isOpenStatus(r.status) && dedupeKey(r) === key)
    .map((r) => r.paymentId);
}

/** Collapses open duplicates into one entry (newest first) with a count. */
export function groupOpenRequests<T extends { userId: string; tier: string; status: string }>(
  rows: T[],
): Array<T & { duplicates: number }> {
  const out: Array<T & { duplicates: number }> = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!isOpenStatus(r.status)) {
      out.push({ ...r, duplicates: 1 });
      continue;
    }
    const k = dedupeKey(r);
    const idx = seen.get(k);
    if (idx === undefined) {
      seen.set(k, out.length);
      out.push({ ...r, duplicates: 1 });
    } else {
      out[idx].duplicates += 1;
    }
  }
  return out;
}
