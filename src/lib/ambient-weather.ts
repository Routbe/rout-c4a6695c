import { z } from "zod";

export const WEATHER_CACHE_MS = 30 * 60 * 1000;
export const WEATHER_STATES = ["Clear", "Rain", "Snow", "Thunderstorm", "Clouds/Fog"] as const;
export type WeatherState = (typeof WEATHER_STATES)[number];
export const weatherCitySchema = z.string().trim().min(2).max(80)
  .regex(/^[\p{L}\p{M}\d\s,.'’()\-]+$/u, "Gebruik een plaatsnaam.");

/** Strip decorative badge emoji; remote/online labels are not locations. */
export function cityFromBadge(badge: unknown): string | null {
  if (typeof badge !== "string") return null;
  const city = badge.replace(/[^\p{L}\p{M}\d\s,.'’()\-]/gu, "").trim();
  if (/^(remote|online|worldwide|wereldwijd|earth|internet|overal)$/i.test(city)) return null;
  const parsed = weatherCitySchema.safeParse(city);
  return parsed.success ? parsed.data : null;
}

/** WMO weather codes used by Open-Meteo. */
export function weatherStateFromCode(code: number): WeatherState | null {
  if (code === 0 || code === 1) return "Clear";
  if ([2, 3, 45, 48].includes(code)) return "Clouds/Fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return null;
}

export function weatherCacheFresh(checkedAt: string | null, now = Date.now()): boolean {
  if (!checkedAt) return false;
  const age = now - new Date(checkedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < WEATHER_CACHE_MS;
}

export const WEATHER_LABEL: Record<WeatherState, string> = {
  Clear: "Helder", Rain: "Regen", Snow: "Sneeuw", Thunderstorm: "Onweer", "Clouds/Fog": "Bewolkt / mist",
};