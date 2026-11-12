/**
 * Uitnodigingslinks met duale identiteit.
 *
 * Een gratis lid deelt zijn alias-namespace (`u_<alias>`), een geverifieerd Pro-lid
 * zijn schone handle. Beide landen op `/signup?ref=…`, waar de code 30 dagen in
 * localStorage + cookie blijft staan tot de registratie hem verzilvert.
 */

export const INVITE_BASE_URL = "https://rout.be";

/** Verwijdert schema, `www.` en trailing slash — altijd `https://rout.be`. */
export function inviteBase(origin?: string): string {
  if (!origin) return INVITE_BASE_URL;
  const cleaned = origin.replace(/\/+$/, "").replace(/^(https?:\/\/)www\./i, "$1");
  return cleaned || INVITE_BASE_URL;
}

export const cleanIdentifier = (raw: string | null | undefined): string =>
  (raw ?? "").replace(/^@+/, "").trim().toLowerCase();

/** `u_jona` voor gratis leden, `jona` voor geverifieerde leden. */
export function inviteRef(handle: string | null | undefined, verified: boolean): string {
  const clean = cleanIdentifier(handle);
  if (!clean) return "";
  return verified ? clean : `u_${clean}`;
}

/** Uitnodiging: `https://rout.be/r/<handle>` (geverifieerd) of `/r/u/<alias>` (gratis). */
export function inviteUrl(
  handle: string | null | undefined,
  verified: boolean,
  origin?: string,
): string {
  const ref = inviteRef(handle, verified);
  if (!ref) return inviteBase(origin);
  const clean = cleanIdentifier(handle);
  return verified
    ? `${inviteBase(origin)}/r/${encodeURIComponent(clean)}`
    : `${inviteBase(origin)}/r/u/${encodeURIComponent(clean)}`;
}

/** Directe profiel-link in de juiste namespace (`/u/<alias>` vs `/<handle>`). */
export function profileInviteUrl(
  handle: string | null | undefined,
  verified: boolean,
  origin?: string,
): string {
  const clean = cleanIdentifier(handle);
  if (!clean) return inviteBase(origin);
  return verified ? `${inviteBase(origin)}/${clean}` : `${inviteBase(origin)}/u/${clean}`;
}

export const INVITE_INTRO =
  "Claim je soevereine digitale identiteit op ROUT via mijn uitnodiging:";

export function inviteMessage(link: string): string {
  return `${INVITE_INTRO} ${link}`;
}
