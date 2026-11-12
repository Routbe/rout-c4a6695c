import { z } from "zod";
import { cityFromBadge, WEATHER_STATES, weatherCacheFresh, weatherCitySchema, weatherStateFromCode, type WeatherState } from "./ambient-weather";
import { weatherQuery } from "./weather-db.server";
import { isEntitledProfile } from "./entitlement-rules";

type Row = Record<string, unknown>;
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function weatherWebhookAllowed(userId: string): Promise<boolean> {
  const rows = await weatherQuery<Row>("select is_paid, verified, is_early_believer, status, is_banned, is_suspended from public.profiles where id = $1 limit 1", [userId]);
  return isEntitledProfile(rows[0]);
}

export async function myWeatherSettings(userId: string) {
  const pro = await weatherWebhookAllowed(userId);
  const rows = await weatherQuery<Row>("select city, token_hash is not null as webhook_active from public.ambient_weather_locations where user_id = $1 limit 1", [userId]);
  return { pro, city: typeof rows[0]?.city === "string" ? rows[0].city : null, webhookActive: rows[0]?.webhook_active === true };
}

export async function rotateWeatherWebhook(userId: string): Promise<string> {
  if (!await weatherWebhookAllowed(userId)) throw new Error("Een Pro-lidmaatschap is vereist.");
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await weatherQuery<Row>(`insert into public.ambient_weather_locations (user_id, token_hash) values ($1, $2)
    on conflict (user_id) do update set token_hash = excluded.token_hash, updated_at = now() returning user_id`, [userId, await digest(token)]);
  return token;
}

export async function clearWeatherWebhook(userId: string) {
  await weatherQuery<Row>("update public.ambient_weather_locations set token_hash = null, city = null, updated_at = now() where user_id = $1 returning user_id", [userId]);
}

/** Secret capability authentication, no IP/GPS/history retained. Token rotation revokes old URLs. */
export async function acceptWeatherCity(token: string, input: unknown): Promise<number> {
  if (!/^[a-f0-9]{64}$/.test(token)) return 401;
  const body = z.object({ city: weatherCitySchema }).strict().safeParse(input);
  if (!body.success) return 400;
  const rows = await weatherQuery<Row>("select user_id from public.ambient_weather_locations where token_hash = $1 limit 1", [await digest(token)]);
  const userId = rows[0]?.user_id;
  if (typeof userId !== "string" || !await weatherWebhookAllowed(userId)) return 401;
  // Bound authenticated updates to one per minute, without storing a travel log.
  const saved = await weatherQuery<Row>(`update public.ambient_weather_locations set city = $2, updated_at = now()
    where user_id = $1 and updated_at < now() - interval '1 minute' returning user_id`, [userId, body.data.city]);
  return saved.length ? 204 : 429;
}

const geocodeSchema = z.object({ results: z.array(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), name: z.string(), country: z.string().optional(), country_code: z.string().optional() })).optional() });
async function fetchJson(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), redirect: "error" });
  if (!response.ok) throw new Error(`Weather provider returned ${response.status}`);
  return response.json();
}

/** Server-to-server only. Provider never receives visitor IPs, user IDs or webhook tokens. */
export async function cachedCityWeather(city: string): Promise<WeatherState | null> {
  const key = await digest(city.toLocaleLowerCase("en").trim());
  const existing = await weatherQuery<Row>("select state, to_json(checked_at) as checked_at from public.ambient_weather_cache where city_key = $1 limit 1", [key]);
  const row = existing[0];
  const stored = WEATHER_STATES.find((s) => s === row?.state) ?? null;
  if (weatherCacheFresh(typeof row?.checked_at === "string" ? row.checked_at : null)) return stored;
  // Atomic lease prevents concurrent visitors from making the same API calls.
  const lease = await weatherQuery<Row>(`insert into public.ambient_weather_cache (city_key, refresh_after) values ($1, now() + interval '30 minutes')
    on conflict (city_key) do update set refresh_after = excluded.refresh_after
    where public.ambient_weather_cache.refresh_after <= now() returning city_key`, [key]);
  if (!lease.length) return stored;
  let state: WeatherState | null = null;
  try {
    const [name, countryHint] = city.split(",").map((p) => p.trim());
    const geocode = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocode.searchParams.set("name", name ?? city);
    geocode.searchParams.set("count", "10");
    geocode.searchParams.set("language", "nl");
    const places = geocodeSchema.parse(await fetchJson(geocode)).results ?? [];
    const location = countryHint ? places.find((p) => p.country?.toLowerCase() === countryHint.toLowerCase() || p.country_code?.toLowerCase() === countryHint.toLowerCase()) : places[0];
    if (location) {
      const forecast = new URL("https://api.open-meteo.com/v1/forecast");
      forecast.searchParams.set("latitude", String(location.latitude));
      forecast.searchParams.set("longitude", String(location.longitude));
      forecast.searchParams.set("current", "weather_code");
      const data = z.object({ current: z.object({ weather_code: z.number().int() }) }).parse(await fetchJson(forecast));
      state = weatherStateFromCode(data.current.weather_code);
    }
  } catch (error) {
    console.warn("[ambient-weather] provider unavailable", error instanceof Error ? error.message : "unknown");
  }
  // Fail neutral, never replace an unknown condition with fake sunny weather.
  await weatherQuery<Row>("update public.ambient_weather_cache set state = $2, checked_at = now() where city_key = $1 returning city_key", [key, state]);
  return state;
}

/** Public read is scoped to a visible profile, never an arbitrary city from a visitor. */
export async function publicProfileWeather(handle: string, alias: boolean): Promise<WeatherState | null> {
  const query = alias
    ? `select a.display_prefs, p.id, p.is_paid, p.verified, p.is_early_believer, p.status, p.is_banned, p.is_suspended
       from public.alias_profiles a join public.profiles p on p.id = a.user_id where lower(a.handle) = lower($1) and a.enabled = true limit 1`
    : `select display_prefs, id, is_paid, verified, is_early_believer, status, is_banned, is_suspended from public.profiles where lower(username) = lower($1) limit 1`;
  const rows = await weatherQuery<Row>(query, [handle]);
  const p = rows[0];
  if (!p || p.is_banned === true || p.is_suspended === true || p.status !== "active") return null;
  const prefs = (p.display_prefs ?? {}) as Row;
  if (prefs.publicProfile === false || prefs.ambientWeather !== true) return null;
  let city = cityFromBadge(prefs.locationBadge);
  if (isEntitledProfile(p)) {
    const locations = await weatherQuery<Row>("select city from public.ambient_weather_locations where user_id = $1 and token_hash is not null limit 1", [p.id]);
    if (typeof locations[0]?.city === "string") city = locations[0].city;
  }
  return city ? cachedCityWeather(city) : null;
}