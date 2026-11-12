/** Last.fm relay (server-only): visitors never contact Last.fm. 30-second in-memory cache. */
import { sql } from "@/lib/neon";
import { LASTFM_IDLE, isFreshLastfm, mapRecentTracks, parseLastfmUser, type LastfmStatus } from "./lastfm";

function lastfmKey(): string | null {
  const v = process.env.LASTFM_API_KEY;
  return v && v.trim() ? v.trim() : null;
}

/** Last.fm user of a public profile whose owner turned on `lastfmPresence`. */
export async function publicLastfmUser(handle: string): Promise<string | null> {
  const rows = (await sql`
    select b ->> 'value' as v from (
      select p.blocks, p.display_prefs from public.profiles p where lower(p.username) = lower(${handle})
      union all
      select a.blocks, a.display_prefs from public.alias_profiles a where lower(a.handle) = lower(${handle})
    ) x, jsonb_array_elements(coalesce(x.blocks, '[]'::jsonb)) b
    where coalesce((x.display_prefs ->> 'publicProfile')::boolean, true)
      and coalesce((x.display_prefs ->> 'lastfmPresence')::boolean, false)
      and b ->> 'kind' = 'lastfm' and coalesce((b ->> 'hidden')::boolean, false) = false
    limit 1`) as Record<string, unknown>[];
  const raw = rows[0]?.["v"];
  return typeof raw === "string" ? parseLastfmUser(raw) : null;
}

const cache = new Map<string, { at: number; value: LastfmStatus }>();

export async function lastfmStatusFor(user: string, now = Date.now()): Promise<LastfmStatus> {
  const key = lastfmKey();
  if (!key) return LASTFM_IDLE;
  const ck = user.toLowerCase();
  const hit = cache.get(ck);
  if (hit && isFreshLastfm(hit.at, now)) return hit.value;
  let value = LASTFM_IDLE;
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json&limit=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (r.ok) value = mapRecentTracks(await r.json());
    else console.error(`[lastfm] ${r.status}`);
  } catch (e) {
    console.error("[lastfm]", e instanceof Error ? e.name : "error");
  }
  if (cache.size > 2000) cache.clear();
  cache.set(ck, { at: now, value });
  return value;
}
