import { describe, expect, it, vi } from "vitest";

const queries: string[] = [];
vi.mock("@/lib/neon", () => ({
  sql: (s: TemplateStringsArray) => {
    queries.push(s.join("?").trim());
    return Promise.resolve([]);
  },
  hasDatabase: () => true,
}));
process.env["SPOTIFY_CLIENT_ID"] = "cid";
process.env["SPOTIFY_CLIENT_SECRET"] = "sec";
const s = await import("@/lib/spotify-presence.server");

describe("spotify oauth", () => {
  it("authorize url forces the consent dialog", () => {
    const url = new URL(s.spotifyAuthorizeUrl("u1", "https://rout.be"));
    expect(url.searchParams.get("show_dialog")).toBe("true");
  });
  it("disconnect deletes presence connection and integration rows", async () => {
    await s.disconnectSpotify("u1");
    expect(queries.some((q) => q.startsWith("delete from public.user_presence_connections"))).toBe(true);
    expect(queries.some((q) => q.startsWith("delete from public.user_integrations"))).toBe(true);
  });
});
