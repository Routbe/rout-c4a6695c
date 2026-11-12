/**
 * Legal-name rules for the Early Believer verification modal.
 *
 * Verification is identity-bound: the member states their full legal name, we
 * store it on the profile, and a verified handle must keep a recognisable link
 * to that name. Client-safe — no server imports.
 */

export function normalizeLegalName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** At least two name parts, letters only (accents, apostrophes and dashes allowed). */
export function legalNameError(raw: string): string | null {
  const value = normalizeLegalName(raw);
  if (value.length < 3) return "Enter your full legal name.";
  if (value.length > 120) return "That name is too long.";
  if (!/^[\p{L}][\p{L}\p{M}'’.\- ]*[\p{L}.]$/u.test(value)) {
    return "Use letters only — no numbers or symbols.";
  }
  if (value.split(" ").filter(Boolean).length < 2) {
    return "Enter both your first and last name.";
  }
  return null;
}

function asciiFold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** The individual name parts of a legal name, folded to plain a–z tokens. */
export function legalNameTokens(legalName: string): string[] {
  return asciiFold(normalizeLegalName(legalName))
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 2);
}

/**
 * A verified member's handle must stay traceable to their legal name. Two
 * shapes are accepted, with or without `.`, `-` or `_` separators:
 *
 * 1. the handle contains one full name part — `jonadelplanche`, `delplanchej`;
 * 2. the handle is a tight initials + name-part combination —
 *    `jdelplanche`, `j.delplanche`, `jzdelplanche`, `jonazd`.
 */
export function handleMatchesLegalName(handle: string, legalName: string | null): boolean {
  if (!legalName) return true; // nothing to correlate against yet
  const cleaned = asciiFold(handle.replace(/^@/, "")).replace(/[._-]/g, "");
  const tokens = legalNameTokens(legalName);
  if (tokens.length === 0) return true;

  if (tokens.some((token) => cleaned.includes(token))) return true;

  // Initials of the remaining name parts, kept in their official order.
  return tokens.some((token) => {
    const others = tokens.filter((t) => t !== token);
    const initials = others.map((t) => t[0]).join("");
    if (!initials) return false;
    for (let take = 1; take <= initials.length; take++) {
      const prefix = initials.slice(0, take);
      const suffix = initials.slice(-take);
      if (cleaned === `${prefix}${token}` || cleaned === `${token}${suffix}`) return true;
      // `jonazd`: a shortened first name plus trailing initials is fine too.
      if (cleaned.startsWith(token) && cleaned === `${token}${suffix}`) return true;
    }
    return false;
  });
}

export const IDENTITY_MISMATCH_MESSAGE =
  "Verified handles stay bound to your legal name — the handle must contain part of it.";

/**
 * Toegestane gebruikersnaam-varianten voor een geverifieerd lid.
 *
 * Een geverifieerde handle blijft altijd herleidbaar naar de wettelijke naam,
 * maar de vorm is vrij: volledige naam, voornaam + initiaal achternaam,
 * initiaal voornaam + achternaam — met `.`, `-`, `_` of niets ertussen.
 */
export function verifiedHandleSuggestions(legalName: string | null): string[] {
  const tokens = legalNameTokens(legalName ?? "");
  if (tokens.length < 2) return [];
  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;
  const separators = ["", ".", "-", "_"];
  const pairs: [string, string][] = [
    [first, last],
    [first, last[0]!],
    [first[0]!, last],
  ];

  const out: string[] = [];
  for (const [a, b] of pairs) {
    for (const sep of separators) {
      const handle = `${a}${sep}${b}`;
      if (handle.length < HANDLE_FLOOR) continue;
      if (!out.includes(handle)) out.push(handle);
    }
  }
  return out;
}

/** Platform-brede ondergrens; hier lokaal gehouden zodat dit bestand client-safe blijft. */
const HANDLE_FLOOR = 5;
