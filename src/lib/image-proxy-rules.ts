/** Which remote images the privacy proxy may fetch (browser-safe, testable). */
export const PROXY_HOSTS = [
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "i.scdn.co",
  "mosaic.scdn.co",
  "lastfm.freetls.fastly.net",
  "i.ytimg.com",
  "avatars.steamstatic.com",
  "avatars.akamai.steamstatic.com",
  "avatars.cloudflare.steamstatic.com",
  "avatars.fastly.steamstatic.com",
  "yt3.ggpht.com",
  "avatars.githubusercontent.com",
  "gitlab.com",
  "secure.gravatar.com",
  "cdn.bsky.app",
  "wakatime.com",
  "sdk.bitmoji.com",
  "images.bitmoji.com",
  "images.chesscomfiles.com",
  "files.mastodon.social",
  "cdn.masto.host",
  "media.mstdn.social",
  "files.mastodon.online",
  "media.mastodon.online",
  "files.mas.to",
  "media.infosec.exchange",
  "files.fosstodon.org",
  "cdn.fosstodon.org",
  "media.chaos.social",
  // Common public photo hosts for gallery image links.
  "images.unsplash.com",
  "images.pexels.com",
  "i.imgur.com",
  "upload.wikimedia.org",
];

export function isAllowedProxyUrl(raw: string, storageHosts: readonly string[] = []): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const host = u.hostname.toLowerCase();
  // Literal IPs never pass: allowlisted names only, so no internal addresses.
  if (/^[\d.]+$/.test(host) || host.includes(":")) return null;
  return PROXY_HOSTS.includes(host) || storageHosts.includes(host) ? u : null;
}

/** Browser helper: route an external image through ROUT. */
export function proxied(url: string | null | undefined): string | null {
  if (!url) return null;
  return isAllowedProxyUrl(url) ? `/api/public/proxy-image?url=${encodeURIComponent(url)}` : null;
}

/** Stored avatars can be first-party paths; never send these to the remote proxy. */
export function profileImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/public/avatar?") || url.startsWith("/api/public/proxy-image?") || url.startsWith("/api/public/integrations/mastodon/avatar?")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.origin === "https://rout.be" && (parsed.pathname === "/api/public/avatar" || parsed.pathname === "/api/public/proxy-image")) return `${parsed.pathname}${parsed.search}`;
    // Browser only routes this candidate; the server checks the configured bucket exactly.
    if (/^[a-z0-9.-]+\.s3\.(fr-par|nl-ams|pl-waw)\.scw\.cloud$/.test(parsed.hostname) &&
        /^\/users\/[a-f0-9-]{36}\/avatar\//.test(parsed.pathname) &&
        parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port) {
      return `/api/public/proxy-image?url=${encodeURIComponent(url)}`;
    }
  } catch { return null; }
  return proxied(url);
}

/** Gallery images: first-party uploads stay as-is, external links only via the proxy. */
export function galleryImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/public/gallery-media?")) return url;
  return proxied(url);
}
