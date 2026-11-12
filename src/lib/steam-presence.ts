/** Steam live status: profile URL parsing, status mapping and cache rules. Pure and browser-safe. */

export const STEAM_TTL_MS = 5 * 60 * 1000;

export type SteamRef = { steamId: string } | { vanity: string };

/** Reads a steamcommunity.com profile link. Anything else is refused. */
export function parseSteamProfileUrl(raw: string | null | undefined): SteamRef | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!/^(www\.)?steamcommunity\.com$/i.test(u.hostname)) return null;
  const [kind, id] = u.pathname.split("/").filter(Boolean);
  if (kind === "profiles" && id && /^7656\d{13}$/.test(id)) return { steamId: id };
  if (kind === "id" && id && /^[A-Za-z0-9_-]{2,32}$/.test(id)) return { vanity: id };
  return null;
}

export type SteamState = "in-game" | "online" | "offline";
export interface SteamStatus {
  state: SteamState;
  name: string | null;
  game: string | null;
  avatar: string | null;
  url: string | null;
}

export const OFFLINE: SteamStatus = { state: "offline", name: null, game: null, avatar: null, url: null };

/** Maps a GetPlayerSummaries player. Private profiles show as offline. */
export function mapSteamPlayer(p: Record<string, unknown> | null | undefined): SteamStatus {
  if (!p || p["communityvisibilitystate"] !== 3) return OFFLINE;
  const persona = Number(p["personastate"] ?? 0);
  const game = typeof p["gameextrainfo"] === "string" && p["gameextrainfo"] ? String(p["gameextrainfo"]).slice(0, 120) : null;
  const avatar = typeof p["avatarfull"] === "string" && /^https:\/\/avatars\.(akamai\.|cloudflare\.|fastly\.)?steamstatic\.com\//.test(p["avatarfull"]) ? p["avatarfull"] : null;
  const url = typeof p["profileurl"] === "string" && parseSteamProfileUrl(p["profileurl"]) ? p["profileurl"] : null;
  const name = typeof p["personaname"] === "string" ? p["personaname"].slice(0, 64) : null;
  const state: SteamState = game ? "in-game" : persona > 0 ? "online" : "offline";
  return { state, name, game, avatar, url };
}

export function isFresh(at: number, now: number, ttl = STEAM_TTL_MS): boolean {
  return now - at < ttl;
}

/** Card effect classes: only when the owner turned them on, laser only while live. */
export function cardEffectClasses(enabled: boolean, live: boolean): string {
  if (!enabled) return "";
  return live ? "rout-laser rout-live-aura" : "rout-glass-sheen";
}
