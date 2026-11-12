/** Config for the `social_feed` block: automatic Bluesky/Mastodon posts on the profile. */
export type SocialFeedPlatform = "bluesky" | "mastodon";
export type SocialFeedDirection = "horizontal" | "vertical";

export interface SocialFeedConfig {
  platform: SocialFeedPlatform;
  /** Bluesky: name.bsky.social — Mastodon: user@instance.social */
  handle: string;
  count: number;
  columns: number;
  direction: SocialFeedDirection;
}

export const SOCIAL_FEED_MAX_COUNT = 12;
export const SOCIAL_FEED_MAX_COLUMNS = 3;

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
};

export function cleanFeedHandle(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/^@+/, "").replace(/\s/g, "").slice(0, 120) : "";
}

export function parseSocialFeedConfig(raw: string | null | undefined): SocialFeedConfig {
  let r: Record<string, unknown> = {};
  try { if (raw && raw.trim().startsWith("{")) r = JSON.parse(raw) as Record<string, unknown>; } catch { r = {}; }
  return {
    platform: r["platform"] === "mastodon" ? "mastodon" : "bluesky",
    handle: cleanFeedHandle(r["handle"]),
    count: clamp(r["count"], 1, SOCIAL_FEED_MAX_COUNT, 6),
    columns: clamp(r["columns"], 1, SOCIAL_FEED_MAX_COLUMNS, 1),
    direction: r["direction"] === "horizontal" ? "horizontal" : "vertical",
  };
}

export const serializeSocialFeedConfig = (c: SocialFeedConfig) => JSON.stringify(parseSocialFeedConfig(JSON.stringify(c)));

/** Mastodon handle → { user, instance }, or null if malformed. */
export function splitMastodonHandle(handle: string): { user: string; instance: string } | null {
  const m = /^([a-z0-9_.]{1,64})@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(cleanFeedHandle(handle));
  return m ? { user: m[1]!, instance: m[2]!.toLowerCase() } : null;
}

export const isBlueskyHandle = (h: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanFeedHandle(h));

/** Strips HTML from Mastodon content into plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}
