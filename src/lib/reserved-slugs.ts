/**
 * Single source of truth for handles that can never be claimed, because they
 * collide with product routes (`/studio`, `/claim`) or with the flat QR tool
 * pages on the root domain (`/iban-qr`, `/wifi-qr`, `/vcard-qr`).
 *
 * Client-safe: no server-only imports, so the signup form, the claim flow and
 * the server-side probe all validate against the exact same list.
 */

/** Flat QR tool pages living directly on the root domain. */
export const TOOL_SLUGS = [
  "iban-qr",
  "wifi-qr",
  "vcard-qr",
  "url-qr",
  "email-qr",
  "sms-qr",
  "text-qr",
] as const;

/** App/product routes and common reserved words. */
export const SYSTEM_SLUGS = [
  "about",
  "admin",
  "api",
  "auth",
  "batch",
  "billing",
  "blog",
  "card",
  "discover",
  "claim",
  "contact",
  "dashboard",
  "de",
  "dev",
  "docs",
  "domains",
  "email-templates",
  "en",
  "faq",
  "fr",
  "free",
  "go",
  "help",
  "hub",
  "legal",
  "login",
  "logout",
  "manifesto",
  "me",
  "my-data",
  "nl",
  "pricing",
  "privacy",
  "profile",
  "r",
  "register",
  "rout",
  "s",
  "security",
  "subscribe",
  "self-hosting",
  "settings",
  "signature",
  "signin",
  "signup",
  "sovereignty",
  "stats",
  "status",
  "studio",
  "support",
  "terms",
  "tools",
  "u",
  "verify",
] as const;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set<string>([
  ...TOOL_SLUGS,
  ...SYSTEM_SLUGS,
]);

export const RESERVED_SLUG_MESSAGE = "This handle is reserved by the platform.";

export function isReservedSlug(handle: string): boolean {
  return RESERVED_SLUGS.has(handle.trim().replace(/^@/, "").toLowerCase());
}
