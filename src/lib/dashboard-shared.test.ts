import { describe, expect, it } from "vitest";
import { interpolateProgress, resolveDashboardCity, spotifyTileAction } from "./dashboard-shared";

const gentWidget = { kind: "wg_weather", value: JSON.stringify({ place: { name: "Gent", lat: 51.05, lon: 3.72, timezone: "Europe/Brussels" } }) };

describe("dashboard shares the profile location", () => {
  it("an own dashboard city wins", () => {
    expect(resolveDashboardCity({ dashboardCity: "Brugge", blocks: [gentWidget], locationBadge: "Antwerpen" })).toEqual({ city: "Brugge", source: "dashboard" });
  });
  it("otherwise the profile widget city", () => {
    expect(resolveDashboardCity({ dashboardCity: null, blocks: [gentWidget], locationBadge: "Antwerpen" })).toEqual({ city: "Gent", source: "widget" });
  });
  it("otherwise the profile location badge, city part only", () => {
    expect(resolveDashboardCity({ dashboardCity: "", blocks: [], locationBadge: "📍 Leuven, België" })).toEqual({ city: "Leuven", source: "profile" });
  });
  it("nothing when the profile has no usable city", () => {
    expect(resolveDashboardCity({ dashboardCity: null, blocks: null, locationBadge: "Remote" })).toEqual({ city: null, source: "none" });
  });
});

describe("Spotify tile", () => {
  it("moves a playing track forward and stops at its end", () => {
    expect(interpolateProgress({ playing: true, progressMs: 10_000, durationMs: 200_000, syncedAt: 1_000 }, 6_000)).toBe(15_000);
    expect(interpolateProgress({ playing: true, progressMs: 199_000, durationMs: 200_000, syncedAt: 0 }, 10_000)).toBe(200_000);
    expect(interpolateProgress({ playing: false, progressMs: 10_000, durationMs: 200_000, syncedAt: 0 }, 50_000)).toBe(10_000);
  });
  it("offers re-linking when access was revoked", () => {
    expect(spotifyTileAction("not_connected")).toBe("connect");
    expect(spotifyTileAction("unauthorized")).toBe("reconnect");
    expect(spotifyTileAction("playing")).toBe("manage");
  });
});
