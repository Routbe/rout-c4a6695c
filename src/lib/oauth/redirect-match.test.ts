import { describe, expect, it } from "vitest";
import { findMatchingRedirect, normalizeRedirectUri, redirectUrisMatch } from "./redirect-match";

const KC = "https://kc.example.com/realms/acme/broker/rout/endpoint";

describe("redirect URI matching", () => {
  it("rejects every non-exact formatting variant", () => {
    expect(redirectUrisMatch(KC, KC)).toBe(true);
    for (const requested of [`${KC}/`, ` ${KC}\u200b`, "https://KC.Example.com:443/realms/acme/broker/rout/endpoint", encodeURIComponent(KC), encodeURIComponent(encodeURIComponent(KC))]) expect(redirectUrisMatch(KC, requested)).toBe(false);
    expect(redirectUrisMatch("https://a.com/cb/%7Brealm%7D", "https://a.com/cb/{realm}")).toBe(false);
  });
  it("stays strict on what matters", () => {
    expect(redirectUrisMatch(KC, "https://evil.com/realms/acme/broker/rout/endpoint")).toBe(false);
    expect(redirectUrisMatch(KC, "http://kc.example.com/realms/acme/broker/rout/endpoint")).toBe(false);
    expect(redirectUrisMatch(KC, `${KC}/extra`)).toBe(false);
    expect(redirectUrisMatch(KC, `${KC}?x=1`)).toBe(false);
    expect(redirectUrisMatch(KC, "https://kc.example.com:8443/realms/acme/broker/rout/endpoint")).toBe(false);
    expect(redirectUrisMatch("https://a.com/Cb", "https://a.com/cb")).toBe(false);
    expect(normalizeRedirectUri(`${KC}#x`)).toBeNull();
    expect(normalizeRedirectUri("https://user:pw@a.com/cb")).toBeNull();
  });
  it("returns the registered form", () => {
    expect(findMatchingRedirect(["https://a.com/x", KC], KC)).toBe(KC);
  });
});

describe("individual redirect rules", () => {
  it.each([
    ["trailing slash", "https://example.com/cb/", "https://example.com/cb", false],
    ["host case", "https://EXAMPLE.com/cb", "https://example.com/cb", false],
    ["default HTTPS port", "https://example.com:443/cb", "https://example.com/cb", false],
    ["default HTTP port", "http://localhost:80/cb", "http://localhost/cb", false],
    ["encoded URL", encodeURIComponent(KC), KC, false],
    ["encoded reserved separator", "https://example.com/a%2fb", "https://example.com/a/b", false],
    ["query mismatch", "https://example.com/cb?a=1", "https://example.com/cb?a=2", false],
    ["credentials", "https://user:pass@example.com/cb", "https://example.com/cb", false],
    ["localhost port mismatch", "http://localhost:3000/cb", "http://localhost:3001/cb", false],
    ["localhost identical port", "http://localhost:3000/cb", "http://localhost:3000/cb", true],
    ["empty fragment", "https://example.com/cb#", "https://example.com/cb", false],
    ["insecure remote host", "http://example.com/cb", "http://example.com/cb", false],
  ])("%s", (_rule, registered, requested, matches) => {
    expect(redirectUrisMatch(registered as string, requested as string)).toBe(matches);
  });
});
