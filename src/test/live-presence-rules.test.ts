import { describe, expect, it } from "vitest";
import { isLiveActive, isLiveDataFresh, isSpotifyVisible } from "@/lib/live-presence-rules";

const now = Date.parse("2026-10-15T12:00:00Z");
describe("live presence windows", () => {
  it("GitHub shows right after a push (within an hour)", () => {
    expect(isLiveActive("github", "2026-10-15T11:20:00Z", now)).toBe(true);
  });
  it("GitHub hides once the last activity is more than an hour old", () => {
    expect(isLiveActive("github", "2026-10-15T10:30:00Z", now)).toBe(false);
    expect(isLiveActive("github", null, now)).toBe(false);
  });
  it("A post shows for 3 hours, then hides", () => {
    expect(isLiveActive("bluesky", "2026-10-15T09:30:00Z", now)).toBe(true);
    expect(isLiveActive("mastodon", "2026-10-15T08:30:00Z", now)).toBe(false);
  });
  it("Chess integrations are not limited", () => {
    expect(isLiveActive("lichess", null, now)).toBe(true);
  });
  it("Spotify only shows while playing", () => {
    expect(isSpotifyVisible({ playing: true })).toBe(true);
    expect(isSpotifyVisible({ playing: false })).toBe(false);
  });
});

import { LIVE_CAPABLE_PROVIDERS as LCP } from "@/lib/live-presence-rules";
describe("Live Integraties list", () => {
  it("contains GitHub and WakaTime but not Spotify (presence-backed)", () => {
    expect(LCP).toContain("github");
    expect(LCP).toContain("wakatime");
    expect(LCP).not.toContain("spotify");
  });
  it("includes YouTube and every other connectable service from the add popup", () => {
    expect(LCP).toContain("youtube");
    expect(LCP).toContain("duolingo");
    expect(LCP).not.toContain("monero");
  });
});

describe("Fediverse 3-hour window", () => {
  it.each(["mastodon", "bluesky", "wsocial"])("%s shows with a post from 1 hour ago", (p) => {
    expect(isLiveActive(p, "2026-10-15T11:00:00Z", now)).toBe(true);
  });
  it.each(["mastodon", "bluesky", "wsocial"])("%s hides when the newest post is 4 hours old", (p) => {
    expect(isLiveActive(p, "2026-10-15T08:00:00Z", now)).toBe(false);
    expect(isLiveActive(p, null, now)).toBe(false);
  });
});

describe("stale live data is hidden", () => {
  const MIN = 60_000;
  it("music disappears 10 minutes after the last successful update", () => {
    expect(isLiveDataFresh("spotify", now - 10 * MIN, now)).toBe(true);
    expect(isLiveDataFresh("spotify", now - 10 * MIN - 1, now)).toBe(false);
    expect(isLiveDataFresh("lastfm", now - 11 * MIN, now)).toBe(false);
  });
  it("a Steam game disappears after 15 minutes without a fresh answer", () => {
    expect(isLiveDataFresh("steam", now - 14 * MIN, now)).toBe(true);
    expect(isLiveDataFresh("steam", now - 16 * MIN, now)).toBe(false);
  });
  it("never shows a live widget that has no successful update yet", () => {
    expect(isLiveDataFresh("steam", 0, now)).toBe(false);
    expect(isLiveDataFresh("lastfm", undefined, now)).toBe(false);
  });
});
