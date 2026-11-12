import { describe, expect, it } from "vitest";
import { parseMaxAge, parseOidcPrompt, validAccessClaims } from "./token-policy";

describe("OAuth token and authorization boundaries", () => {
  const valid = { iss: "https://rout.be", sub: "pairwise", aud: "client", scope: "openid", exp: 200, iat: 90, token_use: "access" };
  it("rejects ID tokens used as bearer tokens", () => {
    expect(validAccessClaims(valid, "https://rout.be", 100)).toBe(true);
    expect(validAccessClaims({ ...valid, token_use: "id" }, "https://rout.be", 100)).toBe(false);
  });
  it("requires exact issuer and finite times", () => {
    expect(validAccessClaims(valid, "https://evil.example", 100)).toBe(false);
    expect(validAccessClaims({ ...valid, exp: 100 }, "https://rout.be", 100)).toBe(false);
    expect(validAccessClaims({ ...valid, iat: 101 }, "https://rout.be", 100)).toBe(false);
    expect(validAccessClaims({ ...valid, exp: NaN }, "https://rout.be", 100)).toBe(false);
  });
  it("allows supported prompts and forbids silent interaction combinations", () => {
    expect(parseOidcPrompt("none")).toEqual(["none"]);
    expect(parseOidcPrompt("login consent")).toEqual(["login", "consent"]);
    expect(() => parseOidcPrompt("none login")).toThrow();
    expect(() => parseOidcPrompt("unknown")).toThrow();
  });
  it("allows zero max_age and rejects negative, fractional, empty or invalid ages", () => {
    expect(parseMaxAge("0")).toBe(0);
    expect(parseMaxAge("300")).toBe(300);
    expect(parseMaxAge(null)).toBeNull();
    for (const value of ["-1", "1.5", "", "abc"]) expect(() => parseMaxAge(value)).toThrow();
  });
});