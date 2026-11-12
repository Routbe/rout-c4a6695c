/**
 * Bio's mogen geen actieve links bevatten: alle links horen in
 * "Links & Componenten". Gedeeld door Studio (live melding) en server (afdwingen).
 */
const LINK_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|be|nl|fr|de|eu|org|net|io|app|dev|co|me|ly|gg|tv|xyz|info|shop|link|social)\b(?:\/\S*)?/gi;

export const BIO_LINK_MESSAGE =
  "Links zijn niet toegestaan in je bio. Voeg ze toe via Links & Componenten.";

export function bioContainsLink(text: string | null | undefined): boolean {
  if (!text) return false;
  LINK_RE.lastIndex = 0;
  return LINK_RE.test(text);
}

/** Verwijdert elke link uit de bio (vangnet voor oude of geïmporteerde data). */
export function stripBioLinks(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  const out = text.replace(LINK_RE, "").replace(/[ \t]{2,}/g, " ").trim();
  return out || null;
}

/** "Lid sinds …" is system metadata (rendered from the account's creation date); members may not type it. */
const MEMBER_SINCE_RE = /\b(lid\s+sinds|member\s+since|membre\s+depuis|mitglied\s+seit)\b/i;
export const BIO_MEMBER_SINCE_MESSAGE =
  "\"Lid sinds\" toont ROUT zelf als badge op je profiel. Haal het uit je bio.";
export function bioClaimsMemberSince(text: string | null | undefined): boolean {
  return Boolean(text && MEMBER_SINCE_RE.test(text));
}
