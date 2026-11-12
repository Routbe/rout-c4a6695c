/**
 * Client-safe helpers voor sociale verificatie (platformlijst + formattering).
 * Geen netwerk- of databasecode: dit bestand komt in de browserbundle.
 */

export const SOCIAL_PLATFORMS = [
  "x",
  "instagram",
  "tiktok",
  "youtube",
  "github",
  "mastodon",
  "bluesky",
  "wsocial",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  github: "GitHub",
  mastodon: "Mastodon",
  bluesky: "Bluesky",
  wsocial: "wsocial.eu",
};

/** Platformen met een open API: verificatie is direct, zonder scraping. */
export const OPEN_PROTOCOL_PLATFORMS: SocialPlatform[] = [
  "github",
  "mastodon",
  "bluesky",
  "wsocial",
];

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/** Verwijdert @, hele URL's en spaties uit een ingevoerde gebruikersnaam. */
export function normalizeSocialUsername(platform: SocialPlatform, raw: string): string {
  let value = raw.trim();
  if (!value) return "";
  value = value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (value.includes("/")) {
    const parts = value.split("/").filter(Boolean);
    value = parts[parts.length - 1] ?? "";
  }
  if (platform !== "mastodon" && platform !== "wsocial") {
    value = value.replace(/^@+/, "");
  } else if (!value.startsWith("@")) {
    value = `@${value}`;
  }
  return value.replace(/\s+/g, "");
}

/** Publieke profiel-URL van een sociaal account. */
export function socialProfileUrl(platform: SocialPlatform, username: string): string {
  const u = username.replace(/^@/, "");
  switch (platform) {
    case "x":
      return `https://x.com/${u}`;
    case "instagram":
      return `https://instagram.com/${u}`;
    case "tiktok":
      return `https://www.tiktok.com/@${u}`;
    case "youtube":
      return `https://www.youtube.com/@${u}`;
    case "github":
      return `https://github.com/${u}`;
    case "bluesky":
      return `https://bsky.app/profile/${u}`;
    case "mastodon":
    case "wsocial": {
      const [handle, host] = u.split("@");
      return host ? `https://${host}/@${handle}` : `https://mastodon.social/@${handle}`;
    }
  }
}

/** 1234 -> "1.2K", 45800 -> "45.8K", 1200000 -> "1.2M". */
export function formatFollowers(count: number | null | undefined): string | null {
  if (count === null || count === undefined || !Number.isFinite(count) || count < 0) return null;
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const k = count / 1000;
    return `${k < 100 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}K`;
  }
  const m = count / 1_000_000;
  return `${m < 100 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)}M`;
}

export const SYNC_INTERVAL_HOURS = 24;

/** Mag dit account opnieuw gesynchroniseerd worden (24-uurslimiet)? */
export function canRefresh(lastSyncedAt: string | null | undefined): boolean {
  if (!lastSyncedAt) return true;
  const then = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(then)) return true;
  return Date.now() - then >= SYNC_INTERVAL_HOURS * 3600 * 1000;
}

export type SocialLinkDTO = {
  id: string;
  platform: SocialPlatform;
  username: string;
  isVerified: boolean;
  followerCount: number | null;
  lastSyncedAt: string | null;
  verifiedAt: string | null;
  lastError: string | null;
};

/** Publieke, gecachte weergave (leest nooit een externe API). */
export type PublicSocialLink = {
  platform: SocialPlatform;
  username: string;
  url: string;
  followerCount: number | null;
  isVerified: boolean;
  /** Last automatic ownership check (ISO). */
  lastSyncedAt?: string | null;
};
