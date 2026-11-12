import { describe, expect, it } from "vitest";
import { getSocialPlatformIcon } from "@/lib/social-icons";

/** The parser must resolve icons from URLs, bare kinds and fediverse handles. */
describe("getSocialPlatformIcon", () => {
  const name = (input: string) => getSocialPlatformIcon(input);

  it("resolves known platforms from a full URL", () => {
    expect(name("https://github.com/routbe")).toBe(name("github"));
    expect(name("https://www.instagram.com/rout.be")).toBe(name("instagram"));
    expect(name("https://bsky.app/profile/rout.be")).toBe(name("bluesky"));
  });

  it("ignores query strings and casing", () => {
    expect(name("HTTPS://YouTube.com/@rout?si=abc")).toBe(name("youtube"));
  });

  it("resolves bare platform kinds and labels", () => {
    expect(name("Matrix")).toBe(name("matrix"));
    expect(name("whatsapp_chat")).toBe(name("whatsapp"));
  });

  it("treats fediverse handles as mastodon", () => {
    expect(name("@rout@mastodon.social")).toBe(name("mastodon"));
  });

  it("falls back gracefully", () => {
    expect(name("https://example.org/page")).not.toBe(name("https://github.com/routbe"));
    expect(getSocialPlatformIcon("")).toBeTruthy();
  });
});
