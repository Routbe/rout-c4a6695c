import { describe, expect, it } from "vitest";
import { buildRichPayload, buildSteamLink, validateRich } from "./rich-qr";

describe("Steam QR type", () => {
  it("keeps custom-ID and SteamID64 profile URLs", () => {
    expect(buildSteamLink({ profile: "https://steamcommunity.com/id/jona/" })).toBe("https://steamcommunity.com/id/jona");
    expect(buildSteamLink({ profile: "steamcommunity.com/profiles/76561197960287930" })).toBe("https://steamcommunity.com/profiles/76561197960287930");
  });
  it("accepts a bare SteamID64 or custom ID", () => {
    expect(buildSteamLink({ profile: "76561197960287930" })).toBe("https://steamcommunity.com/profiles/76561197960287930");
    expect(buildSteamLink({ profile: "jona_gamer" })).toBe("https://steamcommunity.com/id/jona_gamer");
  });
  it("refuses other hosts, store pages and bad IDs", () => {
    expect(buildSteamLink({ profile: "https://steamcommunity.evil.com/id/jona" })).toBe("");
    expect(buildSteamLink({ profile: "https://store.steampowered.com/app/570" })).toBe("");
    expect(buildSteamLink({ profile: "https://steamcommunity.com/profiles/123" })).toBe("");
    expect(validateRich("steam", { profile: "https://example.com" }).profile).toBeTruthy();
  });
  it("is wired into the QR payload builder", () => {
    expect(buildRichPayload("steam", { profile: "jona" })).toBe("https://steamcommunity.com/id/jona");
    expect(validateRich("steam", { profile: "jona" })).toEqual({});
  });
});
