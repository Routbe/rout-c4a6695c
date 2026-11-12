import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Private owner read: never requires enabling public music visibility. */
export const getDashboardMusic = createServerFn({ method: "GET" }).middleware([requireAuth]).handler(async ({ context }) => {
  const { nowPlaying, spotifyConfigured } = await import("./spotify-presence.server");
  if (!spotifyConfigured()) return { playing: false, reason: "not_configured" };
  const { proxied } = await import("./image-proxy-rules");
  try {
    // Same sealed token row as the Studio/Hub link; nowPlaying refreshes it when needed.
    const live = await nowPlaying(context.userId);
    return { ...live, image: proxied(live.image ?? null), syncedAt: Date.now() };
  } catch { return { playing: false, reason: "unavailable" }; }
});

/** Fixed provider endpoints only. No GPS, arbitrary URL, stored location or public visibility. */
export const getDashboardWeather = createServerFn({ method: "POST" }).middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ city: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N} .,'’-]+$/u) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: data.city, count: "1", language: "en", format: "json" })}`, { signal: AbortSignal.timeout(8000) });
      if (!geo.ok) return { ok: false as const, error: "provider_unavailable" };
      const locations = z.object({ results: z.array(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), name: z.string(), country: z.string().optional() })).optional() }).parse(await geo.json());
      const location = locations.results?.[0];
      if (!location) return { ok: false as const, error: "city_not_found" };
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), current: "temperature_2m,weather_code,wind_speed_10m", timezone: "auto" })}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { ok: false as const, error: "provider_unavailable" };
      const weather = z.object({ current: z.object({ temperature_2m: z.number(), weather_code: z.number(), wind_speed_10m: z.number(), time: z.string() }) }).parse(await response.json());
      return { ok: true as const, city: location.name, country: location.country ?? "", ...weather.current };
    } catch { return { ok: false as const, error: "provider_unavailable" }; }
  });

const prefsSchema = z.object({
  layout: z.unknown().optional(),
  weatherCity: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N} .,'’-]+$/u).nullable().optional(),
});

/** Command Center preferences live on the ROUT profile (display_prefs.commandCenter), so they follow the member across devices. */
export const getCommandCenterPrefs = createServerFn({ method: "GET" }).middleware([requireAuth]).handler(async ({ context }) => {
  const { sql } = await import("@/lib/neon");
  const { resolveDashboardCity } = await import("./dashboard-shared");
  const rows = await sql`select display_prefs -> 'commandCenter' as cc, display_prefs ->> 'locationBadge' as badge, blocks
    from public.profiles where id = ${context.userId}`;
  const cc = (rows[0]?.["cc"] ?? {}) as { layout?: unknown; weatherCity?: string | null };
  const ownCity = typeof cc.weatherCity === "string" ? cc.weatherCity : null;
  // One location for profile and dashboard: an own dashboard city overrides, else the profile's.
  const shared = resolveDashboardCity({ dashboardCity: ownCity, blocks: rows[0]?.["blocks"] as never, locationBadge: rows[0]?.["badge"] });
  return { layout: cc.layout ?? null, weatherCity: shared.city, weatherCitySource: shared.source, ownWeatherCity: ownCity };
});

export const saveCommandCenterPrefs = createServerFn({ method: "POST" }).middleware([requireAuth])
  .inputValidator((input: unknown) => prefsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { normalizeDashboardLayout } = await import("./dashboard-layout");
    const patch: Record<string, unknown> = {};
    if (data.layout !== undefined) patch["layout"] = normalizeDashboardLayout(data.layout);
    if (data.weatherCity !== undefined) patch["weatherCity"] = data.weatherCity;
    await sql`update public.profiles set display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb), '{commandCenter}',
      coalesce(display_prefs -> 'commandCenter', '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb, true) where id = ${context.userId}`;
    return { ok: true as const };
  });

/** Every service linked to the ROUT profile (Studio, Command Center or Hub), for the account overview. Never returns tokens. */
export const getAllMyLinkedServices = createServerFn({ method: "GET" }).middleware([requireAuth]).handler(async ({ context }) => {
  const { sql } = await import("@/lib/neon");
  const [presence, integrations] = await Promise.all([
    sql`select provider, show_on_profile, created_at from public.user_presence_connections where user_id = ${context.userId}`.catch(() => []),
    sql`select provider, visible, coalesce(connection_status, 'connected') as status, created_at from public.user_integrations where user_id = ${context.userId}`.catch(() => []),
  ]);
  const map = new Map<string, { provider: string; status: string; publicOnProfile: boolean }>();
  for (const r of integrations as Record<string, unknown>[]) map.set(String(r["provider"]), { provider: String(r["provider"]), status: String(r["status"]), publicOnProfile: Boolean(r["visible"]) });
  for (const r of presence as Record<string, unknown>[]) map.set(String(r["provider"]), { provider: String(r["provider"]), status: "connected", publicOnProfile: Boolean(r["show_on_profile"]) });
  return [...map.values()].sort((a, b) => a.provider.localeCompare(b.provider));
});
