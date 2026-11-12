/**
 * Omni-Matrix ingestion rules (client-safe, no server imports): payload
 * validation, OpenGraph parsing and content-type classification.
 */
import { z } from "zod";

export const OMNI_CONTENT_TYPES = ["article", "podcast", "program", "short", "event", "social"] as const;
export type OmniContentType = (typeof OMNI_CONTENT_TYPES)[number];
export const isOmniContentType = (v: unknown): v is OmniContentType =>
  typeof v === "string" && (OMNI_CONTENT_TYPES as readonly string[]).includes(v);

const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "https_only");

/** Webhook payload (Make.com, n8n, CMS). Unknown keys are rejected. */
export const ingestPayloadSchema = z
  .object({
    target_url: httpsUrl,
    media_url: httpsUrl.optional(),
    title: z.string().trim().max(150).optional(),
  })
  .strict();
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export interface OpenGraph {
  title?: string;
  image?: string;
  type?: string;
  video?: string;
  duration?: number;
  siteName?: string;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

/** Tolerant meta-tag parser for OpenGraph/Twitter cards; relative images resolve against the page. */
export function parseOpenGraph(html: string, pageUrl: string): OpenGraph {
  const head = html.slice(0, 300_000);
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content !== undefined && !meta.has(key)) meta.set(key, decode(content));
  }
  const abs = (v?: string) => {
    if (!v) return undefined;
    try {
      const u = new URL(v, pageUrl);
      return u.protocol === "https:" ? u.toString() : undefined;
    } catch {
      return undefined;
    }
  };
  const titleTag = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(head)?.[1];
  const rawDuration = meta.get("video:duration") ?? meta.get("music:duration") ?? meta.get("og:video:duration");
  const duration = rawDuration && /^\d+$/.test(rawDuration) ? Number(rawDuration) : undefined;
  return {
    title: (meta.get("og:title") ?? meta.get("twitter:title") ?? (titleTag ? decode(titleTag) : undefined))?.slice(0, 150),
    image: abs(meta.get("og:image:secure_url") ?? meta.get("og:image") ?? meta.get("twitter:image")),
    type: meta.get("og:type")?.toLowerCase(),
    video: abs(meta.get("og:video:secure_url") ?? meta.get("og:video")),
    duration,
    siteName: meta.get("og:site_name"),
  };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
const on = (host: string, ...domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

/** Auto-categorisation from domain first, then OpenGraph type. */
export function classifyOmniUrl(url: string, ogType?: string): OmniContentType {
  const host = hostOf(url);
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    /* ignore */
  }
  if (on(host, "youtube.com") && path.startsWith("/shorts/")) return "short";
  if (on(host, "tiktok.com") || (on(host, "instagram.com") && /\/reels?\//.test(path))) return "short";
  if (on(host, "instagram.com", "x.com", "twitter.com", "threads.net", "bsky.app", "facebook.com", "linkedin.com", "mastodon.social")) return "social";
  if (on(host, "open.spotify.com", "podcasts.apple.com", "anchor.fm", "soundcloud.com", "deezer.com", "pocketcasts.com")) return "podcast";
  if (on(host, "youtube.com", "youtu.be", "vimeo.com", "twitch.tv", "vrt.be", "netflix.com", "dailymotion.com")) return "program";
  if (on(host, "eventbrite.com", "eventbrite.be", "meetup.com", "lu.ma", "ticketmaster.com", "ticketmaster.be", "partiful.com")) return "event";
  const t = ogType ?? "";
  if (t.startsWith("music") || t.includes("podcast")) return "podcast";
  if (t.startsWith("video")) return "program";
  if (t === "event" || t.endsWith(":event")) return "event";
  return "article";
}

/** "45:00" for media, "5 min" estimate for articles. */
export function omniMetaTag(type: OmniContentType, ogDurationSeconds?: number, wordCount?: number): string | undefined {
  if (ogDurationSeconds && ogDurationSeconds > 0 && type !== "article") {
    const h = Math.floor(ogDurationSeconds / 3600);
    const m = Math.floor((ogDurationSeconds % 3600) / 60);
    const s = ogDurationSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  if (type === "article" && wordCount && wordCount > 150) return `${Math.max(1, Math.round(wordCount / 230))} min`;
  return undefined;
}

/** YouTube video id for a reliable first-party thumbnail fallback. */
export function youtubeId(url: string): string | null {
  const host = hostOf(url);
  try {
    const u = new URL(url);
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (on(host, "youtube.com")) {
      const m = /^\/(?:shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname);
      return m?.[1] ?? u.searchParams.get("v");
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const OMNI_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
export const OMNI_VIDEO_TYPES: Record<string, string> = { "video/webm": "webm", "video/mp4": "mp4" };
export const OMNI_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const OMNI_MAX_VIDEO_BYTES = 4 * 1024 * 1024;

export type OmniJobStatus = "queued" | "processing" | "ready" | "failed";
export interface OmniJob {
  id: string;
  source: "studio" | "webhook";
  sourceUrl: string;
  status: OmniJobStatus;
  contentType: OmniContentType | null;
  title: string | null;
  metaTag: string | null;
  targetUrl: string | null;
  mediaUrl: string | null;
  kineticPreviewUrl: string | null;
  error: string | null;
  createdAt: string;
}

export const galleryMediaUrl = (path: string) => `/api/public/gallery-media?path=${encodeURIComponent(path)}`;

/** Ingested media must point at a persisted ROUT object, never a remote proxy. */
export function isLocalOmniMediaUrl(value: string): boolean {
  try {
    if (!value.startsWith("/api/public/gallery-media?")) return false;
    const url = new URL(value, "https://rout.be");
    return url.pathname === "/api/public/gallery-media" &&
      /^[0-9a-f-]{36}\/omni-[A-Za-z0-9._-]{1,120}$/.test(url.searchParams.get("path") ?? "") &&
      [...url.searchParams.keys()].every((key) => key === "path") && !url.hash;
  } catch { return false; }
}

export function readyOmniItem(job: OmniJob) {
  if (job.status !== "ready" || !job.contentType || !job.mediaUrl || !isLocalOmniMediaUrl(job.mediaUrl)) return null;
  return {
    id: `omni_${job.id.replace(/-/g, "")}`,
    mediaUrl: job.mediaUrl,
    caption: job.title ?? undefined,
    targetUrl: job.targetUrl ?? undefined,
    contentType: job.contentType,
    metaTag: job.metaTag ?? undefined,
    kineticPreviewUrl: job.kineticPreviewUrl && isLocalOmniMediaUrl(job.kineticPreviewUrl) ? job.kineticPreviewUrl : undefined,
    platform: "custom" as const,
    isVideo: job.contentType === "program" || job.contentType === "short",
    pinned: false,
    isHero: false,
    createdAt: job.createdAt,
  };
}

/** Discover only an advertised HTTPS JSON oEmbed endpoint; the worker still SSRF-checks it. */
export function discoverOEmbed(html: string, pageUrl: string): string | null {
  for (const tag of html.slice(0, 300_000).match(/<link\b[^>]*>/gi) ?? []) {
    if (!/type\s*=\s*["']application\/json\+oembed["']/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      const url = new URL(decode(href), pageUrl);
      if (url.protocol === "https:" && !url.username && !url.password) return url.toString();
    } catch { /* Ignore malformed discovery links. */ }
  }
  return null;
}
