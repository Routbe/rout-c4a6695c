import { describe, expect, it } from "vitest";
import { filterIntegrations, isLive, liveStatOptions, shownLiveStats } from "./integrations-catalog";

const ids = (f: Parameters<typeof filterIntegrations>[0]) => filterIntegrations(f).map((i) => i.id);

describe("integrations grid", () => {
  it("Werk & Code holds GitHub, GitLab, WakaTime, LinkedIn", () => {
    expect(ids("work")).toEqual(["github", "gitlab", "wakatime", "linkedin"]);
  });
  it("Gezondheid & Fitness holds Strava, Oura, Garmin, Apple Health, Google Fit", () => {
    expect(ids("health")).toEqual(["strava", "oura", "garmin", "applehealth", "googlefit"]);
  });
  it("crypto tiles are live, other payment tiles are coming soon", () => {
    expect(filterIntegrations("payments").filter(isLive).map((i) => i.id)).toEqual(["lightning", "monero", "ethereum"]);
  });
  it("wsocial.eu sits in Socials and connects by handle", () => {
    expect(filterIntegrations("socials").find((i) => i.id === "wsocial")?.mode).toBe("handle");
  });
});

describe("youtube live stats", () => {
  it("offers the video count", () => {
    expect(liveStatOptions("youtube")).toContain("videoCount");
  });
  it("never lets one platform show another platform's stat", () => {
    expect(shownLiveStats("lichess", ["videoCount", "blitz"])).toEqual(new Set(["blitz"]));
  });
});
