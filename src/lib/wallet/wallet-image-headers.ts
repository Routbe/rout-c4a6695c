/**
 * Response headers for every generated Google Wallet image (logo + hero).
 * Google's image fetchers and previews load them cross-origin, and every URL is
 * versioned by its design, so a URL's bytes never change and may be cached for a year.
 */
export const WALLET_IMAGE_HEADERS = {
  "content-type": "image/png",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
} as const;
