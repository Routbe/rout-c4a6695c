/**
 * Visual profile widgets (weather, local time, map, a single social post,
 * photo, music track, birthday countdown, text, video). Each lives as a
 * ProfileBlock with a `wg_` kind; its settings are a small JSON object in
 * `value`, so no schema change is needed.
 */

export const VISUAL_WIDGET_KINDS = [
  "wg_weather",
  "wg_clock",
  "wg_map",
  "wg_post",
  "wg_photo",
  "wg_music",
  "wg_birthday",
  "wg_text",
  "wg_video",
] as const;
export type VisualWidgetKind = (typeof VISUAL_WIDGET_KINDS)[number];

export const isVisualWidget = (kind: string): kind is VisualWidgetKind =>
  (VISUAL_WIDGET_KINDS as readonly string[]).includes(kind);

/** Widgets that show a place; they share one saved city so you only enter it once. */
export const LOCATION_WIDGETS: readonly VisualWidgetKind[] = ["wg_weather", "wg_clock", "wg_map"];

export interface WidgetPlace {
  name: string;
  country?: string;
  lat: number;
  lon: number;
  timezone: string;
}

export interface WidgetConfig {
  place?: WidgetPlace;
  zoom?: number;
  url?: string;
  text?: string;
  date?: string;
  caption?: string;
  /** Countdown widget: a yearly birthday (default) or a one-off event. */
  mode?: "birthday" | "event";
  /** Clock widget: 24-hour (default) or 12-hour notation. */
  hour12?: boolean;
}

export function parseWidgetConfig(value: string): WidgetConfig {
  try {
    const raw = JSON.parse(value || "{}") as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return {};
    const out: WidgetConfig = {};
    const p = raw["place"] as Record<string, unknown> | undefined;
    if (p && typeof p["name"] === "string" && Number.isFinite(p["lat"]) && Number.isFinite(p["lon"]) && typeof p["timezone"] === "string") {
      // City-level only: coordinates are rounded to ~1 km.
      out.place = {
        name: p["name"].slice(0, 80),
        ...(typeof p["country"] === "string" ? { country: p["country"].slice(0, 60) } : {}),
        lat: Math.round(Number(p["lat"]) * 100) / 100,
        lon: Math.round(Number(p["lon"]) * 100) / 100,
        timezone: p["timezone"].slice(0, 60),
      };
    }
    if (Number.isFinite(raw["zoom"])) out.zoom = Math.min(13, Math.max(3, Math.round(Number(raw["zoom"]))));
    if (typeof raw["url"] === "string" && /^https:\/\//i.test(raw["url"])) out.url = raw["url"].slice(0, 500);
    if (typeof raw["text"] === "string") out.text = raw["text"].slice(0, 2000);
    if (typeof raw["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw["date"])) out.date = raw["date"];
    if (typeof raw["caption"] === "string") out.caption = raw["caption"].slice(0, 200);
    if (raw["mode"] === "birthday" || raw["mode"] === "event") out.mode = raw["mode"];
    if (typeof raw["hour12"] === "boolean") out.hour12 = raw["hour12"];
    return out;
  } catch {
    return {};
  }
}

export const serializeWidgetConfig = (c: WidgetConfig) => JSON.stringify(c);

/** Days until the next birthday (0 = today). `date` is YYYY-MM-DD; only month/day matter. */
export function daysUntilBirthday(date: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  let next = Date.UTC(now.getFullYear(), month, day);
  if (next < today) next = Date.UTC(now.getFullYear() + 1, month, day);
  return Math.round((next - today) / 86_400_000);
}

/** Days until a one-off date (0 = today, negative = already past). */
export function daysUntilDate(date: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

/** Days shown by the countdown widget: yearly for birthdays, once for events. */
export function countdownDays(config: WidgetConfig, now: Date): number | null {
  if (!config.date) return null;
  return config.mode === "event" ? daysUntilDate(config.date, now) : daysUntilBirthday(config.date, now);
}

/** Direct images only (no pages): https and a common image extension or a first-party upload. */
export function isImageUrl(url: string): boolean {
  if (url.startsWith("/api/public/")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /\.(avif|gif|jpe?g|png|webp)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export type WidgetUrlCheck = "ok" | "empty" | "not_https" | "unsupported";

/** Live validation of the link field of a URL-based widget. */
export function checkWidgetUrl(kind: VisualWidgetKind, url: string): WidgetUrlCheck {
  const value = url.trim();
  if (!value) return "empty";
  if (!/^https:\/\//i.test(value) && !value.startsWith("/api/public/")) return "not_https";
  const ok =
    kind === "wg_post" ? postEmbed(value) !== null
    : kind === "wg_music" ? musicEmbed(value) !== null
    : kind === "wg_video" ? videoEmbed(value) !== null
    : kind === "wg_photo" ? isImageUrl(value)
    : true;
  return ok ? "ok" : "unsupported";
}

/** A widget only renders once it has what it needs; unfinished ones stay hidden on the public page. */
export function isWidgetReady(kind: VisualWidgetKind, config: WidgetConfig): boolean {
  switch (kind) {
    case "wg_weather":
    case "wg_clock":
    case "wg_map":
      return Boolean(config.place);
    case "wg_post":
    case "wg_music":
    case "wg_video":
    case "wg_photo":
      return Boolean(config.url) && checkWidgetUrl(kind, config.url ?? "") === "ok";
    case "wg_birthday":
      return Boolean(config.date);
    case "wg_text":
      return Boolean(config.text?.trim());
  }
}

/** The one shared city: the first location widget that already has a place. */
export function sharedWidgetPlace(blocks: readonly { kind: string; value: string }[]): WidgetPlace | null {
  for (const b of blocks) {
    if (!(LOCATION_WIDGETS as readonly string[]).includes(b.kind)) continue;
    const place = parseWidgetConfig(b.value).place;
    if (place) return place;
  }
  return null;
}

/** Applies a newly picked city to this widget and to every location widget that has none yet. */
export function applySharedPlace<T extends { id: string; kind: string; value: string }>(blocks: T[], id: string, place: WidgetPlace): T[] {
  return blocks.map((b) => {
    if (!(LOCATION_WIDGETS as readonly string[]).includes(b.kind)) return b;
    const config = parseWidgetConfig(b.value);
    if (b.id !== id && config.place) return b;
    return { ...b, value: serializeWidgetConfig({ ...config, place }) };
  });
}

/** Local time at a place, e.g. "14:05". */
export function formatLocalTime(timezone: string, now: Date, hour12 = false, locale = "nl-BE"): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12, timeZone: timezone }).format(now);
  } catch {
    return "";
  }
}

export type PostEmbed =
  | { provider: "instagram" | "x" | "mastodon"; src: string }
  | { provider: "bluesky"; handle: string; rkey: string };

/** Turns a link to one post into an embeddable frame. */
export function postEmbed(url: string): PostEmbed | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  const ig = /^\/(?:[\w.]+\/)?(p|reel)\/([\w-]+)/.exec(u.pathname);
  if (host === "instagram.com" && ig) return { provider: "instagram", src: `https://www.instagram.com/${ig[1]}/${ig[2]}/embed` };
  const x = /\/status\/(\d+)/.exec(u.pathname);
  if ((host === "x.com" || host === "twitter.com") && x) return { provider: "x", src: `https://platform.twitter.com/embed/Tweet.html?id=${x[1]}&dnt=true` };
  const bsky = /^\/profile\/([^/]+)\/post\/([\w]+)/.exec(u.pathname);
  if (host === "bsky.app" && bsky) return { provider: "bluesky", handle: bsky[1]!, rkey: bsky[2]! };
  const masto = /^\/@[\w.]+(?:@[\w.-]+)?\/(\d+)$/.exec(u.pathname);
  if (masto) return { provider: "mastodon", src: `https://${u.hostname}${u.pathname}/embed` };
  return null;
}

/** Spotify, Apple Music, SoundCloud or Deezer track/album link → embed URL. */
export function musicEmbed(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  const sp = /^\/(?:intl-\w+\/)?(track|album|playlist|episode)\/(\w+)/.exec(u.pathname);
  if (host === "open.spotify.com" && sp) return `https://open.spotify.com/embed/${sp[1]}/${sp[2]}`;
  if (host === "music.apple.com") return `https://embed.music.apple.com${u.pathname}${u.search}`;
  if (host === "soundcloud.com") return `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.href)}&visual=true`;
  const dz = /\/(track|album|playlist)\/(\d+)/.exec(u.pathname);
  if (host === "deezer.com" && dz) return `https://widget.deezer.com/widget/auto/${dz[1]}/${dz[2]}`;
  return null;
}

/** YouTube, Vimeo or a direct video file. */
export function videoEmbed(url: string): { kind: "frame" | "file"; src: string } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { kind: "file", src: u.href };
  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.slice(1);
  else if (host === "youtube.com") yt = u.searchParams.get("v") ?? (/^\/(?:shorts|embed|live)\/([\w-]+)/.exec(u.pathname)?.[1] ?? null);
  if (yt && /^[\w-]{6,20}$/.test(yt)) return { kind: "frame", src: `https://www.youtube-nocookie.com/embed/${yt}` };
  const vm = /^\/(\d+)/.exec(u.pathname);
  if (host === "vimeo.com" && vm) return { kind: "frame", src: `https://player.vimeo.com/video/${vm[1]}?dnt=1` };
  return null;
}

/** OpenStreetMap frame around a city; zoom 3 (continent) … 13 (district). Never a street address. */
export function mapEmbedUrl(place: WidgetPlace, zoom: number): string {
  const span = 360 / 2 ** zoom;
  const bbox = [place.lon - span, place.lat - span / 2, place.lon + span, place.lat + span / 2].map((n) => n.toFixed(3)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
}
