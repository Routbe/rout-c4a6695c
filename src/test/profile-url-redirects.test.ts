import { describe, expect, it } from "vitest";
import {
  aliasRedirectFor,
  rootRedirectFor,
  urlStyleForAtPreference,
  urlStyleHasAt,
} from "@/lib/profile-url";

/**
 * Eén geverifieerde hoofdidentiteit, één hoofd-URL: de niet-gekozen vorm
 * (met/zonder @) moet server-side 301-redirecten naar de gekozen hoofd-URL.
 */
describe("profile URL canonicalisation", () => {
  it("redirects the bare root shape to the @ main URL when @ is chosen", () => {
    expect(rootRedirectFor("jona", "clean_at")).toBe("/@jona");
    expect(rootRedirectFor("@jona", "clean_at")).toBeNull();
  });

  it("redirects the @ root shape to the bare main URL when bare is chosen", () => {
    expect(rootRedirectFor("@jona", "clean")).toBe("/jona");
    expect(rootRedirectFor("jona", "clean")).toBeNull();
  });

  it("honours the @ preference stored in legacy /u/ styles", () => {
    expect(rootRedirectFor("jona", "u_at")).toBe("/@jona");
    expect(rootRedirectFor("@jona", "u")).toBe("/jona");
  });

  it("handles percent-encoded @ and mixed case", () => {
    expect(rootRedirectFor("%40Jona", "clean")).toBe("/jona");
    expect(rootRedirectFor("%40jona", "clean_at")).toBeNull();
  });

  it("canonicalises the free /u/ namespace the same way", () => {
    expect(aliasRedirectFor("@jona", "clean")).toBe("/u/jona");
    expect(aliasRedirectFor("jona", "clean_at")).toBe("/u/@jona");
    expect(aliasRedirectFor("@jona", "u_at")).toBeNull();
    expect(aliasRedirectFor("jona", "u")).toBeNull();
  });

  it("never redirects an empty handle", () => {
    expect(rootRedirectFor("", "clean")).toBeNull();
    expect(aliasRedirectFor("", "clean_at")).toBeNull();
  });

  it("maps the binary @ choice to stored styles", () => {
    expect(urlStyleHasAt("clean_at")).toBe(true);
    expect(urlStyleHasAt("u_at")).toBe(true);
    expect(urlStyleHasAt("clean")).toBe(false);
    expect(urlStyleHasAt("u")).toBe(false);
    expect(urlStyleForAtPreference(true)).toBe("clean_at");
    expect(urlStyleForAtPreference(false)).toBe("clean");
  });
});
