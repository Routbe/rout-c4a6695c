/**
 * Short links.
 *
 * A tracked QR and a short link are the same row in `tracked_qrs`: the QR
 * encodes the redirect URL, and the short link *is* that redirect URL shown to
 * humans. `kind` records what the owner made it for:
 *
 *   qr    — created in the studio, only meant to be scanned
 *   link  — created as a short link, no artwork attached
 *   both  — a QR that was later promoted to a shareable short link
 *
 * Resolution always happens on `/s/<slug>` so it can never swallow a public
 * handle route like `/jasper`.
 */
import { db } from "@/lib/db/client";
import {
  BASE36_SLUG_LENGTH,
  SLUG_ALLOCATION_ATTEMPTS,
  randomBase36Slug,
  slugLengthForAttempt,
} from "@/lib/base36";

export type QrKind = "qr" | "link" | "both";

type ResolveShortLinkRow = { status: string };

export const SHORT_LINK_PATH_PREFIX = "/s";

/** Slug alphabet without look-alike characters (no 0/o/1/l). */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function randomSlug(length = 7): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function randomToken(length = 24): string {
  return randomSlug(length);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

/** Reserved so a custom slug can never shadow an app path on a branded domain. */
const RESERVED_SLUGS = new Set([
  "s",
  "api",
  "auth",
  "admin",
  "dashboard",
  "settings",
  "studio",
  "batch",
  "stats",
  "claim",
  "contact",
  "docs",
  "hub",
  "card",
  "go",
  "privacy",
  "terms",
  "manifesto",
  "sovereignty",
  "self-hosting",
  "u",
  "r",
  "en",
  "nl",
]);

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function validateSlug(input: string): { slug: string | null; error: string | null } {
  const slug = normalizeSlug(input);
  if (!slug) return { slug: null, error: "Kies een korte code." };
  if (!SLUG_RE.test(slug)) {
    return { slug: null, error: "Gebruik 2–32 tekens: letters, cijfers of streepjes." };
  }
  if (RESERVED_SLUGS.has(slug)) return { slug: null, error: "Deze code is gereserveerd." };
  return { slug, error: null };
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  const { data } = await (
    db as unknown as { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> }
  ).rpc("resolve_short_link", { _slug: slug });
  const row = Array.isArray(data) ? (data[0] as ResolveShortLinkRow | undefined) : null;
  // Any status other than not_found means the slug is already taken.
  return !row || row.status === "not_found";
}

/**
 * Picks a free random slug; gives up rather than looping forever.
 *
 * Nieuwe links krijgen een 4-teken Base36-code (opgeslagen in kleine letters,
 * weergegeven in hoofdletters), zodat `HTTPS://ROUT.BE/A89K` in een Version 1
 * QR van 21×21 modules past. Botst het, dan proberen we tot drie keer opnieuw
 * op dezelfde lengte en schalen daarna automatisch naar 5 en 6 tekens — zo
 * kunnen codes nooit opraken.
 */
export async function allocateSlug(base: number = BASE36_SLUG_LENGTH): Promise<string | null> {
  for (let attempt = 0; attempt < SLUG_ALLOCATION_ATTEMPTS; attempt++) {
    const slug = randomBase36Slug(slugLengthForAttempt(attempt, base)).toLowerCase();
    if (await isSlugAvailable(slug)) return slug;
  }
  return null;
}

export function appOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/**
 * Base URL for a link. A branded domain is only used when it is verified *and*
 * the owner left short links switched on for it, so turning the toggle off in
 * the domains page immediately falls back to the ROUT domain.
 */
export function shortLinkBase(domain?: string | null, domainEnabled = true): string {
  if (domain && domainEnabled) return `https://${domain}`;
  return appOrigin();
}

export function shortLinkUrl(slug: string, domain?: string | null, domainEnabled = true): string {
  return `${shortLinkBase(domain, domainEnabled)}${SHORT_LINK_PATH_PREFIX}/${slug}`;
}

/**
 * Root-namespace URL: `https://rout.be/a89k`. Werkt naast `/s/<slug>` — de
 * root-resolver herkent 4-teken Base36-codes en stuurt door.
 */
export function shortLinkRootUrl(
  slug: string,
  domain?: string | null,
  domainEnabled = true,
): string {
  return `${shortLinkBase(domain, domainEnabled)}/${slug}`;
}

/**
 * Exacte payload voor de QR-encoder: volledig HOOFDLETTERS, zodat de code in
 * alphanumeric mode gaat en op Version 1 (21×21 modules) blijft.
 */
export function shortLinkQrValue(
  slug: string,
  domain?: string | null,
  domainEnabled = true,
): string {
  return shortLinkRootUrl(slug, domain, domainEnabled).toUpperCase();
}

/** After promoting a QR to a short link (or the other way round). */
export function mergeKind(current: QrKind | string | null, added: QrKind): QrKind {
  if (!current || current === added) return added;
  return "both";
}

// ---------------------------------------------------------------------------
// Genaamruimte-gebonden eigen codes
// ---------------------------------------------------------------------------
//
// Een zelfgekozen code leeft nooit meer in de root (`rout.be/apple`): dat zou
// handles kunnen kapen en met systeemroutes botsen. Hij hangt altijd onder de
// eigenaar:
//
//   geverifieerd → rout.be/jdelplanche/apple
//   gratis       → rout.be/u/jona/apple
//
// In de databank slaan we exact dat pad (zonder leading slash) op als `slug`,
// zodat de resolver hetzelfde pad kan opzoeken.

/** Namespace van een eigenaar: `handle` bij verificatie, anders `u/alias`. */
export function ownerNamespace(handle: string, verified?: boolean): string {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  return verified ? h : `u/${h}`;
}

/** Volledige slug zoals hij in `tracked_qrs.slug` staat. */
export function namespacedSlug(handle: string, verified: boolean, custom: string): string {
  return `${ownerNamespace(handle, verified)}/${normalizeSlug(custom)}`;
}

/** Zichtbaar voorvoegsel voor het invoerveld, bv. `rout.be/u/jona/`. */
export function customLinkPrefix(
  handle: string,
  verified: boolean,
  domain?: string | null,
  domainEnabled = true,
): string {
  const host = shortLinkBase(domain, domainEnabled).replace(/^https?:\/\//, "") || "rout.be";
  return `${host}/${ownerNamespace(handle, verified)}/`;
}

/** Volledige, deelbare URL van een eigen code. */
export function customLinkUrl(
  handle: string,
  verified: boolean,
  custom: string,
  domain?: string | null,
  domainEnabled = true,
): string {
  return `${shortLinkBase(domain, domainEnabled)}/${namespacedSlug(handle, verified, custom)}`;
}

/** Herkent een slug die al onder een namespace hangt (bevat een `/`). */
export function isNamespacedSlug(slug: string): boolean {
  return slug.includes("/");
}
