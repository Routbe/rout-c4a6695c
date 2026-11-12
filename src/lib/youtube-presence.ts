import { createHmac, timingSafeEqual } from "crypto";

/** A stored live status older than this counts as offline. */
export const YOUTUBE_PRESENCE_TTL_MS = 15 * 60 * 1000;
export const YOUTUBE_HUB_URL = "https://pubsubhubbub.appspot.com/subscribe";

export interface YouTubePresence {
  isLive: boolean;
  videoId: string | null;
  title: string | null;
}

/** Live only when confirmed live and confirmed within the TTL. */
export function effectivePresence(p: YouTubePresence | null, at: Date | string | null, now = Date.now()): YouTubePresence {
  const off: YouTubePresence = { isLive: false, videoId: p?.videoId ?? null, title: p?.title ?? null };
  if (!p || !p.isLive || !at) return off;
  const age = now - new Date(at).getTime();
  return Number.isFinite(age) && age >= 0 && age <= YOUTUBE_PRESENCE_TTL_MS ? p : off;
}

export function feedTopic(channelId: string): string {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

export interface FeedEntry { videoId: string; channelId: string; title: string }

/** Minimal Atom parser for hub pushes (yt:videoId, yt:channelId, title). */
export function parseYouTubeFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const m of xml.slice(0, 200_000).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1] ?? "";
    const videoId = /<yt:videoId>([\w-]{6,20})<\/yt:videoId>/.exec(e)?.[1];
    const channelId = /<yt:channelId>([\w-]{10,40})<\/yt:channelId>/.exec(e)?.[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(e)?.[1] ?? "";
    if (videoId && channelId) out.push({ videoId, channelId, title: decodeXml(title).slice(0, 160) });
  }
  return out;
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Per-channel hub secret, derived from the server secret (nothing stored). */
export function hubSecret(serverSecret: string, channelId: string): string {
  return createHmac("sha256", `rout-yt-hub:${serverSecret}`).update(channelId).digest("hex");
}

/** X-Hub-Signature: "sha1=<hex>" HMAC of the raw body. */
export function verifyHubSignature(body: string, header: string | null, secret: string): boolean {
  const m = /^sha1=([0-9a-f]{40})$/i.exec(header ?? "");
  if (!m) return false;
  const want = Buffer.from(createHmac("sha1", secret).update(body).digest("hex"), "hex");
  const got = Buffer.from(m[1]!, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Smart /live link: live stream while live, otherwise the profile. */
export function liveRedirectTarget(p: YouTubePresence, profilePath: string): string {
  return p.isLive && p.videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(p.videoId)}` : profilePath;
}
