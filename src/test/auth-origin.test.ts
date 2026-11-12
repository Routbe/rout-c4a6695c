import { expect, it } from "vitest";
import { AUTH_COOKIE_ATTRIBUTES, configuredAuthOrigin, normalizeAuthOrigin } from "@/lib/auth-origin";

it("uses PUBLIC_ORIGIN ahead of stale authentication URLs", () => {
  expect(configuredAuthOrigin({ PUBLIC_ORIGIN: "https://rout.dlp.li/", BETTER_AUTH_URL: "https://rout.be" })).toBe("https://rout.dlp.li");
});
it("normalizes any valid HTTPS URL to its host-only cookie origin", () => {
  expect(normalizeAuthOrigin("https://custom.example/api/auth?next=studio#login")).toBe("https://custom.example");
});
it("rejects credential-bearing and insecure production URLs", () => {
  expect(normalizeAuthOrigin("https://user:password@custom.example")).toBeNull();
  expect(normalizeAuthOrigin("http://custom.example")).toBeNull();
});
it("preserves secure HttpOnly host-only OAuth cookies", () => {
  expect(AUTH_COOKIE_ATTRIBUTES).toEqual({ secure: true, httpOnly: true, sameSite: "lax", path: "/" });
  expect(AUTH_COOKIE_ATTRIBUTES).not.toHaveProperty("domain");
});