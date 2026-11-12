/** Pure rules for the admin-approved handle whitelist (shared + testable). */

export type WhitelistEntry = { handle: string; status: "approved" | "claimed" | "void" };

/** Only names the admin approved, from the user's own request, can be kept. */
export function pickApproved(proposed: string[], approved: string[]): string[] {
  const allowed = new Set(proposed.map((h) => h.toLowerCase()));
  const out: string[] = [];
  for (const h of approved) {
    const k = h.toLowerCase();
    if (allowed.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/** A claim is valid only for an open whitelist entry and only when nothing was claimed yet. */
export function canClaim(entries: WhitelistEntry[], handle: string): boolean {
  if (entries.some((e) => e.status === "claimed")) return false;
  const k = handle.toLowerCase();
  return entries.some((e) => e.status === "approved" && e.handle.toLowerCase() === k);
}

/** Handle base for a person: "Jan De Smet" → "jandesmet". */
export function personHandleBase(first: string, last: string): string {
  return `${first}${last}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 30);
}
