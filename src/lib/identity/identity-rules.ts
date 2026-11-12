/** Pure regels voor identiteitsverificatie (client-safe, getest). */
export const DIDIT_MONTHLY_LIMIT = 500;

export type IdentityProvider = "w_identity" | "didit" | "manual";

export const DIDIT_LIMIT_MESSAGE =
  "De maandelijkse limiet voor deze verificatiemethode is bereikt. Gebruik W Identity of probeer het volgende maand opnieuw.";

export function diditAvailable(successCount: number): boolean {
  return successCount < DIDIT_MONTHLY_LIMIT;
}

/** Eerste dag van de UTC-maand als YYYY-MM-DD. */
export function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Normaliseert een echte naam: spaties samenvoegen, max 120 tekens. */
export function normalizeRealName(input: string | null | undefined): string | null {
  const v = (input ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return v.length >= 2 ? v : null;
}

/** Een geverifieerde naam overschrijft altijd wat de gebruiker indient. */
export function effectiveDisplayName(submitted: string | null, verifiedRealName: string | null): string | null {
  return verifiedRealName ?? submitted;
}
