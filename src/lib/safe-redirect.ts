/** Own origins redirects may target. Anything else falls back to "/". */
export const TRUSTED_ORIGINS = ["https://rout.be", "https://rout.dlp.li"] as const;

function isDevOrigin(o: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(o);
}

/** Returns a same-site relative path or an absolute URL on a trusted origin; otherwise "/". */
export function safeRedirect(raw: string | null | undefined, opts: { allowDev?: boolean } = {}): string {
  if (!raw || typeof raw !== "string") return "/";
  const s = raw.trim();
  if (/[\\\u0000-\u001f\u007f]/.test(s)) return "/";
  if (s.startsWith("/") && !s.startsWith("//") && !/%2f|%5c|%0[ad]/i.test(s)) return s;
  try {
    const u = new URL(s);
    if ((TRUSTED_ORIGINS as readonly string[]).includes(u.origin) || (opts.allowDev && isDevOrigin(u.origin))) return u.toString();
  } catch {
    /* fall through */
  }
  return "/";
}

/** Trusted origin for building callback URLs, or null when the given one is not ours. */
export function trustedOrigin(raw: string, opts: { allowDev?: boolean } = {}): string | null {
  const r = safeRedirect(raw, opts);
  return r === "/" ? null : new URL(r).origin;
}
