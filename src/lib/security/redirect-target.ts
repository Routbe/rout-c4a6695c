/** Strict browser navigation target, never a fetch authorization. */
export function validatedRedirectTarget(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048 || raw !== raw.trim() || /[\\\u0000-\u0020\u007f]/.test(raw)) return null;
  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || /%2f|%5c|%0[ad]/i.test(raw)) return null;
    const u = new URL(raw, "https://rout.be");
    return u.origin === "https://rout.be" ? raw : null;
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    if (/^(localhost|.*\.(local|internal|localhost|lan|home|arpa))$/i.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}

export function redirectDestination(raw: string, trustedOwner = false, ownDomains: string[] = []): string | null {
  const target = validatedRedirectTarget(raw);
  if (!target) return null;
  if (target.startsWith("/")) return target;
  const host = new URL(target).hostname;
  if (trustedOwner || ["rout.be", "rout.dlp.li", ...ownDomains].includes(host)) return target;
  return `/leaving?target=${encodeURIComponent(target)}`;
}