import { INTEGRATIONS } from "@/lib/integrations-catalog";
/** Live-status visibility: some integrations only show while (recently) in use. Browser-safe. */
const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Live blocks appear only while the member is active or was very recently:
 * just pushed code, just posted. Profile cards (chess, wallets, RSS) are not live and always show.
 */
export const LIVE_WINDOW_MS: Record<string, number> = {
  // Code: only right after a push/edit.
  github: 60 * MIN,
  gitlab: 60 * MIN,
  // Posts: only while the newest post is a few hours old.
  mastodon: 3 * HOUR,
  bluesky: 3 * HOUR,
  wsocial: 3 * HOUR,
};

export function isLiveActive(provider: string, lastActiveAt: string | null | undefined, now = Date.now()): boolean {
  const win = LIVE_WINDOW_MS[provider];
  if (win === undefined) return true;
  if (!lastActiveAt) return false;
  const t = Date.parse(lastActiveAt);
  return Number.isFinite(t) && now - t <= win;
}

/**
 * Live widgets fed by polling (music, games) disappear once their last successful update
 * is older than this, even when a failed refresh left the old answer cached.
 */
export const LIVE_DATA_MAX_AGE_MS: Record<string, number> = {
  spotify: 10 * MIN,
  lastfm: 10 * MIN,
  steam: 15 * MIN,
};

export function isLiveDataFresh(provider: string, updatedAt: number | null | undefined, now = Date.now()): boolean {
  const max = LIVE_DATA_MAX_AGE_MS[provider];
  if (max === undefined) return true;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || updatedAt <= 0) return false;
  return now - updatedAt <= max;
}

/** Spotify shows only while something is actually playing. */
export function isSpotifyVisible(np: { playing?: boolean } | null | undefined): boolean {
  return np?.playing === true;
}

/**
 * Vault providers that appear under "Live Integraties": every connectable catalog service
 * (the same list the add-component popup offers), except Spotify (presence-backed) and payments.
 */
export const LIVE_CAPABLE_PROVIDERS: string[] = INTEGRATIONS
  .filter((i) => i.mode !== "soon" && i.id !== "spotify" && i.id !== "snapchat" && i.category !== "payments")
  .map((i) => i.id);

/** Separate Snap Kit rows count once, independently of visibility or recent activity. */
export function liveConnectionCount(spotify: boolean, providers: string[], snapchat: boolean): number {
  return Number(spotify) + new Set(providers.filter((p) => LIVE_CAPABLE_PROVIDERS.includes(p))).size + Number(snapchat);
}
