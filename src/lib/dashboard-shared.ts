/**
 * Command Center ↔ profile sharing rules (browser-safe, pure).
 *
 * The dashboard never asks for data the profile already holds: the weather tile
 * uses the dashboard's own city only when the member set one there, otherwise
 * the city of the profile's weather/clock/map widget, otherwise the city on the
 * profile location badge. Spotify uses the one shared Live Presence link.
 */
import { cityFromBadge } from "./ambient-weather";
import { sharedWidgetPlace } from "./profile-widgets";

export type DashboardCitySource = "dashboard" | "widget" | "profile" | "none";

export function resolveDashboardCity(input: {
  dashboardCity: string | null | undefined;
  blocks: readonly { kind: string; value?: string }[] | null | undefined;
  locationBadge: unknown;
}): { city: string | null; source: DashboardCitySource } {
  const own = typeof input.dashboardCity === "string" ? input.dashboardCity.trim() : "";
  if (own.length >= 2) return { city: own, source: "dashboard" };
  const blocks = Array.isArray(input.blocks) ? input.blocks : [];
  const place = sharedWidgetPlace(blocks.map((b) => ({ kind: String(b?.kind ?? ""), value: typeof b?.value === "string" ? b.value : "" })));
  if (place?.name) return { city: place.name, source: "widget" };
  const badge = cityFromBadge(typeof input.locationBadge === "string" ? input.locationBadge : null);
  // Badges read "Gent, België"; the weather lookup wants the city name only.
  const city = badge?.split(",")[0]?.trim() ?? "";
  if (city.length >= 2) return { city, source: "profile" };
  return { city: null, source: "none" };
}

/** Track position now, moved forward locally from the server's measurement. */
export function interpolateProgress(t: { playing?: boolean; progressMs?: number; durationMs?: number; syncedAt?: number }, now: number): number {
  const base = Math.max(0, t.progressMs ?? 0);
  const duration = Math.max(0, t.durationMs ?? 0);
  if (!t.playing || t.syncedAt == null) return duration ? Math.min(base, duration) : base;
  const moved = base + Math.max(0, now - t.syncedAt);
  return duration ? Math.min(moved, duration) : moved;
}

/** What the Spotify tile offers: link, re-link (revoked/expired) or manage. */
export function spotifyTileAction(reason: string | undefined): "connect" | "reconnect" | "manage" {
  if (reason === "not_connected") return "connect";
  if (reason === "unauthorized" || reason === "reauth_required") return "reconnect";
  return "manage";
}

export function formatTrackTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
