/**
 * Structuurregels voor gebruikersnamen van GEVERIFIEERDE accounts.
 *
 * Een geverifieerd account draagt het blauwe vinkje en mag daarom nooit een
 * willekeurige alias claimen: de handle is altijd "voornaam + achternaam", met
 * één van de toegestane scheidingstekens (`.` `,` `-` `_` `+` `~`) of direct
 * aan elkaar. Precies één van beide delen mag afgekort worden tot de eerste
 * letter — het andere deel staat er volledig in.
 *
 *   jona.delplanche · jona_delplanche · jonadelplanche
 *   j.delplanche · jdelplanche · delplanche.j · jona.d
 *
 * Client-safe: geen server-imports.
 */

/** Scheidingstekens die een geverifieerde handle mag gebruiken. */
export const VERIFIED_SEPARATORS = ["", ".", ",", "-", "_", "+", "~"] as const;

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Voor- en achternaam uit een volledige wettelijke naam (tussennamen vallen weg). */
export function nameParts(
  legalName: string | null | undefined,
): { first: string; last: string } | null {
  const tokens = (legalName ?? "")
    .split(/\s+/)
    .map((part) => fold(part))
    .filter((part) => part.length >= 1);
  if (tokens.length < 2) return null;
  return { first: tokens[0]!, last: tokens[tokens.length - 1]! };
}

/**
 * Elke toegestane handle-vorm voor deze wettelijke naam, inclusief varianten
 * met de omgekeerde volgorde (achternaam eerst) en de afgekorte vormen.
 */
export function verifiedHandleVariants(legalName: string | null | undefined): string[] {
  const parts = nameParts(legalName);
  if (!parts) return [];
  const { first, last } = parts;
  const pairs: [string, string][] = [
    [first, last],
    [last, first],
    [first[0]!, last],
    [last, first[0]!],
    [first, last[0]!],
    [last[0]!, first],
  ];

  const out: string[] = [];
  for (const [a, b] of pairs) {
    for (const separator of VERIFIED_SEPARATORS) {
      const handle = `${a}${separator}${b}`;
      if (!out.includes(handle)) out.push(handle);
    }
  }
  return out;
}

export const VERIFIED_STRUCTURE_MESSAGE =
  "Een geverifieerde gebruikersnaam is je voornaam en achternaam — met . , - _ + ~ of direct aan elkaar. " +
  "Eén van beide delen mag afgekort worden tot de eerste letter (bijv. jona.delplanche, j.delplanche, delplanche.j).";

export const VERIFIED_NEEDS_NAME_MESSAGE =
  "Vul eerst je wettelijke voor- en achternaam in — die bepaalt welke gebruikersnamen je mag claimen.";

/**
 * `null` wanneer de handle voldoet aan de naamstructuur van een geverifieerd
 * account. Vergelijking gebeurt op de gevouwen vorm, zodat accenten en de
 * gekozen scheidingstekens niet uitmaken.
 */
export function verifiedHandleError(
  handle: string,
  legalName: string | null | undefined,
): string | null {
  const clean = fold(handle.replace(/^@+/, ""));
  if (!clean) return VERIFIED_STRUCTURE_MESSAGE;
  const parts = nameParts(legalName);
  if (!parts) return VERIFIED_NEEDS_NAME_MESSAGE;
  const allowed = verifiedHandleVariants(legalName).map((variant) => fold(variant));
  return allowed.includes(clean) ? null : VERIFIED_STRUCTURE_MESSAGE;
}

/** Handige weergavelijst (met scheidingsteken) voor suggesties in de UI. */
export function verifiedHandleSuggestionList(legalName: string | null | undefined): string[] {
  return verifiedHandleVariants(legalName).filter((handle) => handle.length >= 5);
}
