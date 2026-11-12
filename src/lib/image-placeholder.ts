/** First-party neutral avatar; no remote redirect when private cache storage is down. */
export function unavailableImageResponse(): Response {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="#eeeeee"/><g fill="none" stroke="#777777" stroke-width="4"><circle cx="48" cy="34" r="13"/><path d="M23 78c0-17 11-26 25-26s25 9 25 26"/></g></svg>';
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", "x-rout-image-status": "unavailable" } });
}