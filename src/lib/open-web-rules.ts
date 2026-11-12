/** Browser-safe rules for keyless open-web fetchers and bio-check verification. */

/**
 * Verification matrix: per platform whether ownership can be proven via OAuth
 * sign-in and/or via the public bio, and where the server reads that bio.
 */
export const VERIFICATION_MATRIX = {
  bluesky: { supportsOAuth: true, supportsBioScrape: true, bioSource: "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=" },
  wsocial: { supportsOAuth: false, supportsBioScrape: true, bioSource: "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=" },
  mastodon: { supportsOAuth: false, supportsBioScrape: true, bioSource: "https://<instance>/api/v1/accounts/lookup?acct=" },
  github: { supportsOAuth: true, supportsBioScrape: true, bioSource: "https://api.github.com/users/" },
  chesscom: { supportsOAuth: false, supportsBioScrape: true, bioSource: "https://www.chess.com/member/" },
} as const satisfies Record<string, { supportsOAuth: boolean; supportsBioScrape: boolean; bioSource: string }>;

export type BioProvider = keyof typeof VERIFICATION_MATRIX;
export const BIO_VERIFIABLE = (Object.keys(VERIFICATION_MATRIX) as BioProvider[]).filter(
  (k) => VERIFICATION_MATRIX[k].supportsBioScrape,
);
export function isBioVerifiable(provider: string): provider is BioProvider {
  return (BIO_VERIFIABLE as readonly string[]).includes(provider);
}

export type VerificationMethod = "oauth" | "bio_scrape" | null;

function escapeRegex(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True only when the bio contains exactly `rout.be/<username>` (optionally
 * `www.` or a scheme before it), followed by whitespace, a quote, a slash,
 * `<`, common punctuation or the end of the text. `rout.be/anna` never
 * matches `rout.be/annabel`, and `evilrout.be/anna` never matches.
 */
export function bioContainsRoutLink(bio: string | null | undefined, username: string): boolean {
  if (!bio || !username || !/^[a-z0-9._-]{2,40}$/i.test(username)) return false;
  const name = escapeRegex(username);
  const re = new RegExp(
    `(?:^|[\\s"'(<>]|https?://)(?:www\\.)?(?:rout\\.be/(?:u/)?${name}|${name}\\.(?:u\\.|r\\.)?rout\\.be)(?=[\\s"'/<>)?#,;!]|\\.(?![a-z0-9_-])|$)`,
    "i",
  );
  return re.test(bio);
}

/** Exact first-party host ownership; never accept arbitrary nested labels. */
export function isMemberRoutHost(host: string, username: string): boolean {
  const name = username.toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9._-]{2,40}$/.test(name)) return false;
  return [`${name}.rout.be`, `${name}.u.rout.be`, `${name}.r.rout.be`].includes(host.toLowerCase());
}

/** A verification code stays valid this long. */
export const VERIFY_CODE_TTL_MS = 30 * 60 * 1000;

/** True when the code appears in the bio (case-insensitive, HTML stripped). */
export function bioContainsCode(bio: string | null | undefined, code: string): boolean {
  if (!bio || !code) return false;
  const text = bio.replace(/<[^>]*>/g, " ").toLowerCase();
  return text.includes(code.toLowerCase());
}

/**
 * Public host check for user-supplied URLs fetched server-side (RSS, Mastodon instance).
 * Blocks IP literals and internal names so the fetcher cannot reach private networks.
 */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h)) return false;
  return !/(^|\.)(localhost|local|internal|lan|home|corp|intranet|test|invalid|example)$/.test(h);
}

/** `@user@domain` → `user@domain`, or null. */
export function normalizeMastodon(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  const m = v.match(/^https:\/\/([^/]+)\/@([a-z0-9_]{1,30})\/?$/);
  if (m) v = `${m[2]}@${m[1]}`;
  v = v.replace(/^@/, "");
  const [user, domain, extra] = v.split("@");
  if (extra !== undefined || !user || !domain) return null;
  if (!/^[a-z0-9_]{1,30}$/.test(user) || !isPublicHost(domain)) return null;
  return `${user}@${domain}`;
}

/** Feed URL, `name.substack.com`, `medium.com/@name`, `letterboxd.com/name` → https feed URL, or null. */
export function normalizeFeed(raw: string): string | null {
  let v = raw.trim();
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.username || u.password || (u.port && u.port !== "443")) return null;
  u.protocol = "https:";
  const host = u.hostname.toLowerCase();
  if (!isPublicHost(host)) return null;
  const path = u.pathname.replace(/\/+$/, "");
  if (host.endsWith(".substack.com") && (path === "" || path === "/")) return `https://${host}/feed`;
  if (host === "medium.com" && /^\/@[A-Za-z0-9._-]+$/.test(path)) return `https://medium.com/feed${path}`;
  if (host === "letterboxd.com" && /^\/[A-Za-z0-9_]+$/.test(path)) return `https://letterboxd.com${path}/rss/`;
  return u.toString();
}

export type FeedItem = { title: string; url: string; date: string | null };

function decode(s: string): string {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]*>/g, "")
    .trim();
}

/** Lightweight RSS 2.0 / Atom parser: the newest `limit` entries with https links only. */
export function parseFeed(xml: string, limit = 3): { title: string | null; items: FeedItem[] } {
  const channelTitle = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) ?? [];
  const items: FeedItem[] = [];
  for (const b of blocks) {
    const title = b.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1];
    const link =
      b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/)?.[1] ??
      b.match(/<link[^>]*href=["']([^"']+)["']/)?.[1] ??
      b.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const date = b.match(/<(pubDate|published|updated|dc:date)>([\s\S]*?)<\/\1>/)?.[2];
    const url = link ? decode(link) : "";
    if (!title || !/^https:\/\//.test(url)) continue;
    const t = Date.parse(date ? decode(date) : "");
    items.push({ title: decode(title).slice(0, 160), url, date: Number.isNaN(t) ? null : new Date(t).toISOString() });
    if (items.length >= limit) break;
  }
  return { title: channelTitle ? decode(channelTitle).slice(0, 120) : null, items };
}
