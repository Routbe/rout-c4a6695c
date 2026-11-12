/** Browser-safe guestbook rules. */
export const GUESTBOOK_MAX = 150;
/** Max notes one member may leave on one profile per window. */
export const GUESTBOOK_BURST = 3;
export const GUESTBOOK_WINDOW_MS = 10 * 60 * 1000;
/** Max pinned notes shown publicly. */
export const GUESTBOOK_PIN_LIMIT = 6;

/** Trimmed, single-spaced note, or null when empty / too long. */
export function normalizeNote(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const v = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!v || [...v].length > GUESTBOOK_MAX) return null;
  return v;
}
