/**
 * Canonical production paths for the ROUT brand.
 *
 * Everything brand-related resolves through here so no component ever
 * hardcodes a temporary CDN, placeholder or preview-host URL again.
 */

/** Production origin — used for absolute URLs (social cards, feeds, e-mails). */
export const SITE_ORIGIN = "https://rout.be";

/** Logo path served from our own domain: https://rout.be/img/logo.png */
export const LOGO_PATH = "/img/logo.png";

/** Monochrome rabbit mark (loaders, e-mail headers): /img/rout-bunny.png */
export const BUNNY_PATH = "/img/rout-bunny.png";

/** Absolute logo URL — always loaded from rout.be, also in preview. */
export const LOGO_URL = `${SITE_ORIGIN}${LOGO_PATH}`;

/** Absolute rabbit-mark URL — always loaded from rout.be, also in preview. */
export const BUNNY_URL = `${SITE_ORIGIN}${BUNNY_PATH}`;

/**
 * Same-origin path for an asset rendered inside the app (masks, swatches, img
 * tags). Rendering these from the production origin breaks previews and forks:
 * only e-mails and social cards need an absolute URL.
 */
export const brandAsset = (path: string) => (path.startsWith("/") ? path : `/${path}`);

/** Absolute URL for any asset that lives under our own /img directory. */
export const assetUrl = (path: string) =>
  `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;

/** Ready-made social-card meta tags pointing at the production logo. */
export const socialImageMeta = [
  { property: "og:image", content: LOGO_URL },
  { name: "twitter:image", content: LOGO_URL },
];

/**
 * Third-party brand marks — hardcoded absolute production URLs.
 * Never import these through Vite; the bundler would rewrite them to a
 * temporary preview host and break production.
 */
export const BRAND_MARK_URLS = {
  // Canoniek eyou-merkteken uit eigen asset — nooit een externe host.
  eyou: `${SITE_ORIGIN}/img/brand/eyou.svg`,
  mastodon: `${SITE_ORIGIN}/img/brand/mastodon.svg`,
  keycloak: `${SITE_ORIGIN}/img/brand/keycloak.svg`,
} as const;

/** QR type illustrations (absolute, production-hosted). */
export const qrTypeImageUrl = (name: string) => `${SITE_ORIGIN}/img/${name}`;

/** Self-referencing canonical link for a static route path (`/`, `/claim`, …). */
export const canonicalLink = (path: string) => ({
  rel: "canonical",
  href: `${SITE_ORIGIN}${path === "/" ? "" : path}`,
});

/** `og:url` meta for a static route path — must self-reference the page. */
export const canonicalMeta = (path: string) => ({
  property: "og:url",
  content: `${SITE_ORIGIN}${path === "/" ? "" : path}`,
});

/** Keeps private / transient screens out of the index. */
export const noindexMeta = { name: "robots", content: "noindex,nofollow" };
