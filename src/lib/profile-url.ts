import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";

/**
 * Shared identity, one main URL.
 *
 * A member has a single verified identity and chooses whether their main URL
 * carries the @ sign: `rout.be/@jona` or `rout.be/jona`. Every other shape
 * (`/jona`, `/@jona`, `/u/jona`, `/u/@jona`) is canonicalised server-side with
 * a 301 redirect to the chosen main URL — never two separate profile pages.
 */

export type UrlStyle = "u" | "u_at" | "clean" | "clean_at";

export const URL_STYLES: UrlStyle[] = ["u_at", "u", "clean_at", "clean"];

export const DEFAULT_URL_STYLE: UrlStyle = "u_at";

export const isUrlStyle = (value: unknown): value is UrlStyle =>
  typeof value === "string" && (URL_STYLES as string[]).includes(value);

/** Strips a leading @, decodeert URL-encoding en lowercased — de canonieke databasehandle. */
export const canonicalHandle = (raw: string) => sanitizeHandleInput(raw);

/** Path for a handle in the requested display style. */
export function styledProfilePath(handle: string, style: UrlStyle = DEFAULT_URL_STYLE): string {
  const h = canonicalHandle(handle);
  switch (style) {
    case "u":
      return `/u/${h}`;
    case "clean":
      return `/${h}`;
    case "clean_at":
      return `/@${h}`;
    case "u_at":
    default:
      return `/u/@${h}`;
  }
}

/** Human-facing URL without the scheme, e.g. `rout.be/u/@jona`. */
export function styledProfileLabel(
  handle: string,
  style: UrlStyle = DEFAULT_URL_STYLE,
  domain = "rout.be",
): string {
  return `${domain}${styledProfilePath(handle, style)}`;
}

export function styledProfileUrl(
  handle: string,
  style: UrlStyle = DEFAULT_URL_STYLE,
  origin = "https://rout.be",
): string {
  return `${origin.replace(/\/$/, "")}${styledProfilePath(handle, style)}`;
}

/** Every shape a visitor may type — used by tests and share copy. */
export const allProfilePaths = (handle: string) =>
  URL_STYLES.map((style) => styledProfilePath(handle, style));

/**
 * The shape ROUT may actually show for a member.
 *
 * Clean root URLs (`/jona`, `/@jona`) are part of the verified namespace, so an
 * unverified member's chosen style is folded back to its `/u/` twin — the `@`
 * preference is kept. Every shape still resolves to the same profile, this only
 * decides what the app displays and links to.
 */
export function effectiveUrlStyle(style: UrlStyle, verified: boolean): UrlStyle {
  if (verified) return style;
  if (style === "clean") return "u";
  if (style === "clean_at") return "u_at";
  return style;
}

/** True when the member wants the @ sign in their main URL. */
export const urlStyleHasAt = (style: UrlStyle): boolean =>
  style === "u_at" || style === "clean_at";

/** The style to save for a member's binary with/without-@ choice. */
export const urlStyleForAtPreference = (hasAt: boolean): UrlStyle =>
  hasAt ? "clean_at" : "clean";

const requestedHasAt = (rawUsername: string): boolean =>
  rawUsername.startsWith("@") || rawUsername.toLowerCase().startsWith("%40");

/**
 * Canonicalisation for the verified root namespace (`rout.be/<handle>`).
 * Returns the 301 target when the requested shape is not the member's chosen
 * main URL, otherwise null. Only the @ preference matters here: root profiles
 * are always verified, so the main URL is always a clean path.
 */
export function rootRedirectFor(rawUsername: string, style: UrlStyle): string | null {
  const handle = canonicalHandle(rawUsername);
  if (!handle) return null;
  const canonical = styledProfilePath(handle, urlStyleForAtPreference(urlStyleHasAt(style)));
  const requested = requestedHasAt(rawUsername) ? `/@${handle}` : `/${handle}`;
  return requested === canonical ? null : canonical;
}

/** Same canonicalisation inside the free `/u/` namespace. */
export function aliasRedirectFor(rawUsername: string, style: UrlStyle): string | null {
  const handle = canonicalHandle(rawUsername);
  if (!handle) return null;
  const canonical = `/u/${urlStyleHasAt(style) ? "@" : ""}${handle}`;
  const requested = requestedHasAt(rawUsername) ? `/u/@${handle}` : `/u/${handle}`;
  return requested === canonical ? null : canonical;
}
