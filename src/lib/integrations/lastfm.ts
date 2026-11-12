/** Last.fm "now playing" rules. Pure and browser-safe. */
export const LASTFM_TTL_MS = 30_000;

export type LastfmStatus = { playing: boolean; track: string | null; artist: string | null; art: string | null; url: string | null };
export const LASTFM_IDLE: LastfmStatus = { playing: false, track: null, artist: null, art: null, url: null };

/** Username from a Last.fm profile link or a bare name. */
export function parseLastfmUser(value: string): string | null {
  const v = value.trim();
  const m = v.match(/last\.fm\/(?:[a-z]{2}\/)?user\/([A-Za-z0-9_.-]{2,15})/i);
  const name = m ? m[1]! : /^[A-Za-z][A-Za-z0-9_.-]{1,14}$/.test(v) ? v : null;
  return name;
}

/** Maps user.getRecentTracks; only a track flagged nowplaying counts as live. */
export function mapRecentTracks(json: unknown): LastfmStatus {
  const t = (json as { recenttracks?: { track?: unknown } })?.recenttracks?.track;
  const first = (Array.isArray(t) ? t[0] : t) as Record<string, unknown> | undefined;
  if (!first || (first["@attr"] as { nowplaying?: string } | undefined)?.nowplaying !== "true") return LASTFM_IDLE;
  const artist = first["artist"] as { "#text"?: string; name?: string } | undefined;
  const images = (first["image"] as { "#text"?: string; size?: string }[] | undefined) ?? [];
  const art = images.find((i) => i.size === "large")?.["#text"] || images[images.length - 1]?.["#text"] || null;
  const url = typeof first["url"] === "string" && /^https:\/\/(www\.)?last\.fm\//.test(first["url"]) ? first["url"] : null;
  return {
    playing: true,
    track: typeof first["name"] === "string" ? first["name"].slice(0, 200) : null,
    artist: (artist?.["#text"] ?? artist?.name ?? null)?.slice(0, 200) ?? null,
    art: art || null,
    url,
  };
}

export const isFreshLastfm = (at: number, now: number) => now - at < LASTFM_TTL_MS;
