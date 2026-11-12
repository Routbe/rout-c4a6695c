/** Canonicalize configured URLs without trusting request-supplied hosts. */
export function normalizeAuthOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return null;
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    return url.origin;
  } catch { return null; }
}

export function configuredAuthOrigin(env: Record<string, string | undefined>): string | null {
  return normalizeAuthOrigin(env.PUBLIC_ORIGIN) ?? normalizeAuthOrigin(env.BETTER_AUTH_URL)
    ?? normalizeAuthOrigin(env.NEXT_PUBLIC_APP_URL);
}

export const AUTH_COOKIE_ATTRIBUTES = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

/**
 * Better Auth base URL. The approved host the browser is actually on wins, so
 * the state and session cookies (host-only) are set and read on one host even
 * when the edge redirects between apex and www. Unapproved hosts (random
 * deploy previews) fall back to the configured origin, then the canonical one.
 */
export function chooseAuthBaseUrl(
  requestOrigin: string | null,
  requestHostApproved: boolean,
  configured: string | null,
  fallback: string,
): string {
  if (requestOrigin && requestHostApproved) return requestOrigin;
  return configured ?? fallback;
}
