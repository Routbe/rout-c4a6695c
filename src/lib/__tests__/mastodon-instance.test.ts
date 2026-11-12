import { describe, expect, it } from "vitest";
import { fediverseEmail, fediverseHandle, normalizeInstance } from "../mastodon-instance";

describe("normalizeInstance", () => {
  it("accepts a bare domain", () => {
    expect(normalizeInstance("mastodon.social")).toBe("mastodon.social");
  });

  it("strips scheme, trailing slash and casing", () => {
    expect(normalizeInstance("https://Fosstodon.org/")).toBe("fosstodon.org");
    expect(normalizeInstance("  HTTP://MSTDN.be  ")).toBe("mstdn.be");
  });

  it("accepts full handles", () => {
    expect(normalizeInstance("@me@mstdn.be")).toBe("mstdn.be");
    expect(normalizeInstance("me@mstdn.be")).toBe("mstdn.be");
  });

  it("drops paths, queries and ports", () => {
    expect(normalizeInstance("https://mastodon.social/about")).toBe("mastodon.social");
    expect(normalizeInstance("mastodon.social:8443")).toBe("mastodon.social");
    expect(normalizeInstance("mastodon.social?x=1")).toBe("mastodon.social");
  });

  it("rejects unusable input", () => {
    expect(normalizeInstance("")).toBeNull();
    expect(normalizeInstance("localhost")).toBeNull();
    expect(normalizeInstance("rout.be")).toBeNull();
    expect(normalizeInstance("127.0.0.1")).toBeNull();
    expect(normalizeInstance("not a domain")).toBeNull();
    expect(normalizeInstance("nodot")).toBeNull();
  });
});

describe("handle helpers", () => {
  it("formats a handle and a stable synthetic address", () => {
    expect(fediverseHandle("me", "mstdn.be")).toBe("@me@mstdn.be");
    expect(fediverseEmail("Me", "mstdn.be")).toBe("me@mstdn.be");
  });
});
