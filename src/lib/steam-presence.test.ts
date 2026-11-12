import { describe, expect, it } from "vitest";
import { cardEffectClasses, isFresh, mapSteamPlayer, parseSteamProfileUrl, STEAM_TTL_MS } from "./steam-presence";

describe("steam presence rules", () => {
  it("reads numeric and vanity profile links, refuses other hosts", () => {
    expect(parseSteamProfileUrl("https://steamcommunity.com/profiles/76561197960287930")).toEqual({ steamId: "76561197960287930" });
    expect(parseSteamProfileUrl("https://steamcommunity.com/id/jona/")).toEqual({ vanity: "jona" });
    expect(parseSteamProfileUrl("https://evil.example/id/jona")).toBeNull();
    expect(parseSteamProfileUrl("https://steamcommunity.com/profiles/123")).toBeNull();
  });

  it("maps in game, online and offline", () => {
    expect(mapSteamPlayer({ communityvisibilitystate: 3, personastate: 1, gameextrainfo: "Portal 2" }).state).toBe("in-game");
    expect(mapSteamPlayer({ communityvisibilitystate: 3, personastate: 3 }).state).toBe("online");
    expect(mapSteamPlayer({ communityvisibilitystate: 3, personastate: 0 }).state).toBe("offline");
  });

  it("private profiles and missing data count as offline", () => {
    expect(mapSteamPlayer({ communityvisibilitystate: 1, personastate: 1, gameextrainfo: "X" }).state).toBe("offline");
    expect(mapSteamPlayer(null).state).toBe("offline");
  });

  it("drops avatars from hosts outside Steam", () => {
    expect(mapSteamPlayer({ communityvisibilitystate: 3, personastate: 1, avatarfull: "https://evil.example/a.jpg" }).avatar).toBeNull();
  });

  it("cache stays fresh for 5 minutes", () => {
    expect(STEAM_TTL_MS).toBe(300_000);
    expect(isFresh(0, 299_999)).toBe(true);
    expect(isFresh(0, 300_000)).toBe(false);
  });

  it("effects only when turned on, laser only while live", () => {
    expect(cardEffectClasses(false, true)).toBe("");
    expect(cardEffectClasses(true, true)).toContain("rout-laser");
    expect(cardEffectClasses(true, false)).not.toContain("rout-laser");
  });
});
