import { describe, expect, it } from "vitest";
import { normalizeBlueskyHandle, withBlueskySuffix } from "@/lib/bluesky-handle";
import { filterMastodonServers } from "@/lib/mastodon-servers";

describe("bluesky handle", () => {
  it("adds .bsky.social and strips @", () => {
    expect(normalizeBlueskyHandle("@Jona")).toBe("jona.bsky.social");
    expect(normalizeBlueskyHandle("jona.be")).toBe("jona.be");
    expect(normalizeBlueskyHandle("")).toBeNull();
    expect(withBlueskySuffix("jona.bsky.social", "eurosky.social")).toBe("jona.eurosky.social");
  });
});

describe("mastodon servers", () => {
  it("suggests by prefix and handles @user@host", () => {
    expect(filterMastodonServers("mas")[0]).toBe("mastodon.social");
    expect(filterMastodonServers("@me@foss")).toContain("fosstodon.org");
    expect(filterMastodonServers("").length).toBeGreaterThan(0);
  });
});
