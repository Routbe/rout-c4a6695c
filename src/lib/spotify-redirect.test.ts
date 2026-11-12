import { describe, expect, it } from "vitest";
import { spotifyRedirectUri } from "./spotify-presence.server";

const req = (url: string, h: Record<string, string> = {}) => new Request(url, { headers: h });
describe("spotify redirect uri", () => {
  it("production behind proxy is always https://rout.be", () => {
    expect(spotifyRedirectUri(req("http://rout.be/api/spotify/start", { "x-forwarded-proto": "http" }))).toBe("https://rout.be/api/public/spotify/callback");
    expect(spotifyRedirectUri(req("http://x/", { "x-forwarded-host": "www.rout.be" }))).toBe("https://rout.be/api/public/spotify/callback");
  });
  it("localhost keeps http", () => {
    expect(spotifyRedirectUri(req("http://localhost:8080/api/spotify/start"))).toBe("http://localhost:8080/api/public/spotify/callback");
  });
});
