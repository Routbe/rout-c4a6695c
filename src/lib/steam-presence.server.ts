/** Steam relay (server-only): visitors never contact Steam. 5-minute in-memory cache. */
import { sql } from "@/lib/neon";
import { OFFLINE, STEAM_TTL_MS, isFresh, mapSteamPlayer, parseSteamProfileUrl, type SteamStatus } from "./steam-presence";

const API = "https://api.steampowered.com";

export function steamKey(): string | null {
  const v = process.env.STEAM_WEB_API_KEY;
  return v && v.trim() ? v.trim() : null;
}

/** Steam link of a public profile whose owner turned on `steamPresence`. */
export async function publicSteamLink(handle: string): Promise<string | null> {
  const rows = (await sql`
    select b ->> 'value' as url from (
      select p.blocks, p.display_prefs from public.profiles p where lower(p.username) = lower(${handle})
      union all
      select a.blocks, a.display_prefs from public.alias_profiles a where lower(a.handle) = lower(${handle})
    ) x, jsonb_array_elements(coalesce(x.blocks, '[]'::jsonb)) b
    where coalesce((x.display_prefs ->> 'publicProfile')::boolean, true)
      and coalesce((x.display_prefs ->> 'steamPresence')::boolean, false)
      and b ->> 'kind' = 'steam' and coalesce((b ->> 'hidden')::boolean, false) = false
    limit 1`) as Record<string, unknown>[];
  return (rows[0]?.["url"] as string | undefined) ?? null;
}

const cache = new Map<string, { at: number; value: SteamStatus }>();

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) {
    console.error(`[steam] ${r.status}`);
    return null;
  }
  return (await r.json()) as Record<string, unknown>;
}

/** Status for a Steam profile link; offline without a key or on any failure. */
export async function steamStatusFor(link: string, now = Date.now()): Promise<SteamStatus> {
  const ref = parseSteamProfileUrl(link);
  const key = steamKey();
  if (!ref || !key) return OFFLINE;
  const ck = "steamId" in ref ? ref.steamId : `v:${ref.vanity.toLowerCase()}`;
  const hit = cache.get(ck);
  if (hit && isFresh(hit.at, now, STEAM_TTL_MS)) return hit.value;
  let value = OFFLINE;
  try {
    let id = "steamId" in ref ? ref.steamId : null;
    if (!id && "vanity" in ref) {
      const v = await getJson(`${API}/ISteamUser/ResolveVanityURL/v0001/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(ref.vanity)}`);
      const resp = v?.["response"] as Record<string, unknown> | undefined;
      id = resp?.["success"] === 1 && typeof resp["steamid"] === "string" ? resp["steamid"] : null;
    }
    if (id) {
      const s = await getJson(`${API}/ISteamUser/GetPlayerSummaries/v0002/?key=${encodeURIComponent(key)}&steamids=${id}`);
      const players = (s?.["response"] as Record<string, unknown> | undefined)?.["players"];
      value = mapSteamPlayer(Array.isArray(players) ? (players[0] as Record<string, unknown>) : null);
    }
  } catch (e) {
    console.error("[steam]", e instanceof Error ? e.name : "error");
  }
  cache.set(ck, { at: now, value });
  return value;
}
