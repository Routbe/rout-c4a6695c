/**
 * Structured `ROUT-XXXXXX` payment reference parsing, shared by the inbound
 * webhook and the admin SEPA-matching UI. Pulled out into its own module so it
 * can be unit-tested without spinning up a server function.
 */

// Bank software mangles free-text differently (line breaks, extra spaces,
// lower-case, stray punctuation right next to the code) — normalise before
// matching so "rout-demo01", "ROUT- DEMO01" and "Ref:ROUT-DEMO01." all hit.
const REFERENCE_RE = /ROUT[\s-]*([A-Z0-9]{4,8})/i;

/**
 * Extracts the first `ROUT-XXXXXX` style reference from free-text (a bank
 * transfer description, an inbound e-mail body, …). Returns the normalised,
 * upper-cased `ROUT-XXXXXX` form, or `null` when nothing matches.
 */
export function parseRoutReference(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = REFERENCE_RE.exec(text);
  if (!match) return null;
  const code = match[1];
  if (!code) return null;
  return `ROUT-${code.toUpperCase()}`;
}

/** Every distinct `ROUT-XXXXXX` reference found in a longer text blob. */
export function parseAllRoutReferences(text: string | null | undefined): string[] {
  if (!text) return [];
  const re = new RegExp(REFERENCE_RE.source, "gi");
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const code = match[1];
    if (code) found.add(`ROUT-${code.toUpperCase()}`);
  }
  return [...found];
}

/**
 * Best-effort amount extraction from a bank notification body. Handles the
 * shapes Wise/Bunq/KBC use: `EUR 15,99`, `€15.99`, `15,99 EUR`. Returns cents,
 * or `null` when nothing looks like a euro amount.
 */
export function parseAmountCents(text: string | null | undefined): number | null {
  if (!text) return null;
  const patterns = [
    /(?:EUR|€)\s*([0-9]{1,6}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/i,
    /([0-9]{1,6}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:EUR|€)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    const raw = m?.[1];
    if (!raw) continue;
    // Last separator followed by exactly two digits is the decimal separator.
    const normalized = /[.,][0-9]{2}$/.test(raw)
      ? raw.slice(0, -3).replace(/[.,]/g, "") + "." + raw.slice(-2)
      : raw.replace(/[.,]/g, "");
    const value = Number(normalized);
    if (Number.isFinite(value)) return Math.round(value * 100);
  }
  return null;
}
