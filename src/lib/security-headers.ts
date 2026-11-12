/** Pure security-header rules (applied in src/start.ts, covered by tests). */

/** Only rout.be and the Lovable editor may frame the app. */
export const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://rout.be https://*.rout.be https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com";

/** Public OIDC endpoints — the only paths that may answer cross-origin. */
export const PUBLIC_OIDC_PATHS = [
  "/.well-known/openid-configuration",
  "/.well-known/jwks.json",
  "/api/public/oauth/token",
  "/api/public/oauth/userinfo",
];

export function isPublicOidcPath(pathname: string): boolean {
  return PUBLIC_OIDC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Sensitive areas (sign-in, passkeys, account settings) that get strict isolation. */
export const STRICT_PATH_PREFIXES = ["/auth", "/settings", "/studio/account"];

export function isStrictPath(pathname: string): boolean {
  return STRICT_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Strict CSP for /auth and /settings: default-src 'self'. Inline scripts/styles stay
 * allowed because SSR hydration emits them; form-action allows OAuth provider redirects.
 */
export const STRICT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "form-action 'self' https:",
  "base-uri 'self'",
  "object-src 'none'",
  FRAME_ANCESTORS,
].join("; ");

/**
 * CSP for every public page (profiles, links, home): scripts only from our own
 * origin (+ Stripe.js), no plugins, no foreign forms or <base>. Inline scripts
 * stay allowed because TanStack SSR hydration emits them; removing them needs
 * per-request nonces from the framework.
 */
export const PUBLIC_CSP = [
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "worker-src 'self' blob:",
  FRAME_ANCESTORS,
].join("; ");

/**
 * Route-aware headers. Public pages (profiles, home) stay maximally compatible
 * (no COOP, cross-origin CORP) so browsers like Opera never answer
 * ERR_BLOCKED_BY_RESPONSE; /auth and /settings get a strict CSP plus
 * same-origin resource policy. COOP stays `same-origin-allow-popups` there
 * because OAuth/passkey popups must keep their opener.
 */
export function securityHeaders(isHttps: boolean, pathname = "/"): Record<string, string> {
  const strict = isStrictPath(pathname);
  const h: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-DNS-Prefetch-Control": "off",
    "Permissions-Policy": "geolocation=(), microphone=(), payment=()",
  };
  if (strict) {
    h["Content-Security-Policy"] = STRICT_CSP;
    h["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups";
    h["Cross-Origin-Resource-Policy"] = "same-origin";
  } else {
    h["Content-Security-Policy"] = PUBLIC_CSP;
    h["Cross-Origin-Opener-Policy"] = "unsafe-none";
    h["Cross-Origin-Resource-Policy"] = "cross-origin";
  }
  if (isHttps) h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return h;
}

const SESSION_COOKIE = /^(rout_session|__Secure-rout_session|better-auth\.[^=]*|__Secure-better-auth\.[^=]*)=/i;

/** Returns the problems with a session Set-Cookie header (empty = fine or not a session cookie). */
export function sessionCookieProblems(setCookie: string): string[] {
  if (!SESSION_COOKIE.test(setCookie)) return [];
  const flags = setCookie.toLowerCase();
  const problems: string[] = [];
  if (!/;\s*httponly/.test(flags)) problems.push("HttpOnly");
  if (!/;\s*secure/.test(flags)) problems.push("Secure");
  if (!/;\s*samesite=(lax|strict)/.test(flags)) problems.push("SameSite=Lax");
  return problems;
}
