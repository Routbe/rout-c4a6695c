import { describe, expect, it } from "vitest";
import { parseSocialFeedConfig, splitMastodonHandle } from "./social-feed";
import { normalizeDisplayPrefs } from "./profile-display";

describe("social feed config", () => {
  it("clamps posts per row to 3 and count to 12", () => {
    const c = parseSocialFeedConfig(JSON.stringify({ platform: "mastodon", handle: "@a@b.social", count: 99, columns: 9, direction: "horizontal" }));
    expect(c).toMatchObject({ platform: "mastodon", handle: "a@b.social", count: 12, columns: 3, direction: "horizontal" });
  });
  it("rejects malformed mastodon handles", () => {
    expect(splitMastodonHandle("noinstance")).toBeNull();
    expect(splitMastodonHandle("me@mastodon.social")).toEqual({ user: "me", instance: "mastodon.social" });
  });
});

describe("message board", () => {
  it("is off by default", () => {
    expect(normalizeDisplayPrefs({}).guestbookEnabled).toBe(false);
    expect(normalizeDisplayPrefs({ guestbookEnabled: true }).guestbookEnabled).toBe(true);
  });
});
