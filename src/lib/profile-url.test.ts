import { describe, expect, it } from "vitest";
import {
  allProfilePaths,
  canonicalHandle,
  DEFAULT_URL_STYLE,
  effectiveUrlStyle,
  isUrlStyle,
  styledProfileLabel,
  styledProfilePath,
  styledProfileUrl,
  URL_STYLES,
  type UrlStyle,
} from "./profile-url";
import { isReservedHandle, RESERVED_HANDLES } from "./profile";

/**
 * End-to-end routing contract for the flexible profile URL.
 *
 * The four shapes are interchangeable: whichever one a member picks, the app
 * must produce a path that one of the two file routes (`/$username` and
 * `/u/$username`) actually matches, and every shape must resolve to the same
 * canonical handle.
 */

/** Mirrors the file-based routes in src/routes: /$username and /u/$username. */
function matchRoute(path: string): { route: string; username: string } | null {
  const u = /^\/u\/([^/]+)$/.exec(path);
  if (u) return { route: "/u/$username", username: u[1]! };
  const root = /^\/([^/]+)$/.exec(path);
  if (root) return { route: "/$username", username: root[1]! };
  return null;
}

describe("styledProfilePath", () => {
  it("renders each of the four shapes", () => {
    expect(styledProfilePath("jona", "u")).toBe("/u/jona");
    expect(styledProfilePath("jona", "u_at")).toBe("/u/@jona");
    expect(styledProfilePath("jona", "clean")).toBe("/jona");
    expect(styledProfilePath("jona", "clean_at")).toBe("/@jona");
  });

  it("defaults to /u/@handle", () => {
    expect(styledProfilePath("jona")).toBe(styledProfilePath("jona", DEFAULT_URL_STYLE));
    expect(styledProfilePath("jona")).toBe("/u/@jona");
  });

  it("canonicalises the handle regardless of input casing or @", () => {
    for (const style of URL_STYLES) {
      expect(styledProfilePath("@JoNa", style)).toBe(styledProfilePath("jona", style));
    }
  });
});

describe("route matching", () => {
  it("every styled path is matched by a real route", () => {
    for (const path of allProfilePaths("jona")) {
      const match = matchRoute(path);
      expect(match, `no route matches ${path}`).not.toBeNull();
      expect(canonicalHandle(match!.username)).toBe("jona");
    }
  });

  it("splits the namespaces as expected", () => {
    expect(matchRoute("/u/@jona")?.route).toBe("/u/$username");
    expect(matchRoute("/u/jona")?.route).toBe("/u/$username");
    expect(matchRoute("/@jona")?.route).toBe("/$username");
    expect(matchRoute("/jona")?.route).toBe("/$username");
  });

  it("does not hijack reserved app paths in the root namespace", () => {
    for (const reserved of ["claim", "auth", "dashboard", "terms", "privacy"]) {
      expect(isReservedHandle(reserved), `${reserved} must be reserved`).toBe(true);
    }
    // No reserved word may be handed out as a handle in the clean namespace.
    expect(RESERVED_HANDLES.every((h) => h === canonicalHandle(h))).toBe(true);
  });
});

describe("labels and absolute urls", () => {
  it("prefixes the domain without a scheme", () => {
    expect(styledProfileLabel("jona", "u_at")).toBe("rout.be/u/@jona");
    expect(styledProfileLabel("jona", "clean", "rout.local")).toBe("rout.local/jona");
  });

  it("builds absolute urls and tolerates a trailing slash on the origin", () => {
    expect(styledProfileUrl("jona", "clean_at")).toBe("https://rout.be/@jona");
    expect(styledProfileUrl("jona", "u", "https://rout.be/")).toBe("https://rout.be/u/jona");
  });
});

describe("effectiveUrlStyle", () => {
  it("keeps every choice for a verified member", () => {
    for (const style of URL_STYLES) {
      expect(effectiveUrlStyle(style, true)).toBe(style);
    }
  });

  it("folds clean shapes back into /u/ for free members, keeping the @ choice", () => {
    expect(effectiveUrlStyle("clean", false)).toBe("u");
    expect(effectiveUrlStyle("clean_at", false)).toBe("u_at");
    expect(effectiveUrlStyle("u", false)).toBe("u");
    expect(effectiveUrlStyle("u_at", false)).toBe("u_at");
  });

  it("never returns a root-namespace path for a free member", () => {
    for (const style of URL_STYLES) {
      const path = styledProfilePath("jona", effectiveUrlStyle(style, false));
      expect(path.startsWith("/u/")).toBe(true);
    }
  });
});

describe("isUrlStyle", () => {
  it("accepts the four known styles and rejects anything else", () => {
    for (const style of URL_STYLES) expect(isUrlStyle(style)).toBe(true);
    for (const bad of ["", "at", "root", null, 3, undefined]) {
      expect(isUrlStyle(bad as unknown as UrlStyle)).toBe(false);
    }
  });
});
