/** Browser-safe routing only; DNS, media and cache validation stays server-side. */
export function mastodonAvatarSrc(value?: string | null): string | null {
  if (!value) return null;
  let handle = value.trim();
  if (handle.startsWith("https://")) {
    try {
      const url = new URL(handle);
      const match = /^\/@([a-zA-Z0-9_.-]+)\/?$/.exec(url.pathname);
      if (!match?.[1] || url.username || url.password || (url.port && url.port !== "443")) return null;
      handle = `@${match[1]}@${url.hostname}`;
    } catch { return null; }
  }
  if (!/^@?[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(handle)) return null;
  return `/api/public/integrations/mastodon/avatar?handle=${encodeURIComponent(handle)}`;
}