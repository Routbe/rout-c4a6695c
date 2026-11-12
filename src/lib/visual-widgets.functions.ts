import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * Visual profile widgets: city search for the Studio and a cached weather read
 * for visitors. Visitors never call the weather provider directly, and only a
 * city-level point (rounded to ~1 km) ever leaves ROUT.
 */

const placeQuery = z.object({ query: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{M}\p{N} .,'’()-]+$/u) });

const geoResult = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        timezone: z.string().optional(),
      }),
    )
    .optional(),
});

/** Owner-only city search for weather, clock and map widgets. */
export const searchWidgetPlaces = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => placeQuery.parse(input))
  .handler(async ({ data }) => {
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: data.query, count: "6", language: "nl", format: "json" })}`,
        { signal: AbortSignal.timeout(8000), redirect: "error" },
      );
      if (!res.ok) return { ok: false as const, error: "provider_unavailable" as const, places: [] };
      const parsed = geoResult.parse(await res.json());
      const places = (parsed.results ?? [])
        .filter((r) => r.timezone)
        .map((r) => ({
          name: r.name.slice(0, 80),
          country: [r.admin1, r.country].filter(Boolean).join(", ").slice(0, 60) || undefined,
          lat: Math.round(r.latitude * 100) / 100,
          lon: Math.round(r.longitude * 100) / 100,
          timezone: r.timezone!.slice(0, 60),
        }));
      return { ok: true as const, places };
    } catch {
      return { ok: false as const, error: "provider_unavailable" as const, places: [] };
    }
  });

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

type WeatherNow = { ok: true; temperature: number; code: number; wind: number; isDay: boolean; fetchedAt: number } | { ok: false; error: "provider_unavailable" };

const WEATHER_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, WeatherNow & { at: number }>();

/** Public, cached current weather for one city-level point. */
export const getWidgetWeather = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => point.parse(input))
  .handler(async ({ data }): Promise<WeatherNow> => {
    const lat = Math.round(data.lat * 100) / 100;
    const lon = Math.round(data.lon * 100) / 100;
    const key = `${lat},${lon}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit;
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({ latitude: String(lat), longitude: String(lon), current: "temperature_2m,weather_code,wind_speed_10m,is_day", timezone: "auto" })}`,
        { signal: AbortSignal.timeout(8000), redirect: "error" },
      );
      if (!res.ok) return { ok: false, error: "provider_unavailable" };
      const body = z
        .object({ current: z.object({ temperature_2m: z.number(), weather_code: z.number(), wind_speed_10m: z.number(), is_day: z.number() }) })
        .parse(await res.json());
      const out: WeatherNow = {
        ok: true,
        temperature: body.current.temperature_2m,
        code: body.current.weather_code,
        wind: body.current.wind_speed_10m,
        isDay: body.current.is_day === 1,
        fetchedAt: Date.now(),
      };
      if (cache.size > 500) cache.clear();
      cache.set(key, { ...out, at: Date.now() });
      return out;
    } catch {
      return { ok: false, error: "provider_unavailable" };
    }
  });
