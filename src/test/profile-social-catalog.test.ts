import { describe, expect, it } from "vitest";
import { BLOCK_KINDS, blockHref } from "@/lib/profile";

describe("social component catalog", () => {
  it("includes each requested platform once", () => {
    for (const kind of ["tumblr", "vimeo", "dailymotion", "peertube", "lemmy", "misskey", "behance", "dribbble", "patreon", "kofi", "spotify_artist", "soundcloud", "steam", "viber"]) {
      expect(BLOCK_KINDS.filter((p) => p.kind === kind)).toHaveLength(1);
      expect(BLOCK_KINDS.find((p) => p.kind === kind)?.tags?.length).toBeGreaterThan(0);
    }
  });
  it("creates canonical fixed-host URLs and preserves instance URLs", () => {
    const href = (kind: string, value: string) => blockHref({ id: "test", kind, value, label: kind });
    expect(href("tumblr", "@jona")).toBe("https://www.tumblr.com/jona");
    expect(href("vimeo", "jona")).toBe("https://vimeo.com/jona");
    expect(href("dailymotion", "jona")).toBe("https://www.dailymotion.com/jona");
    expect(href("spotify_artist", "123")).toBe("https://open.spotify.com/artist/123");
    expect(href("viber", "+32470000000")).toBe("viber://chat?number=+32470000000");
    for (const kind of ["peertube", "lemmy", "misskey"]) {
      expect(href(kind, "https://example.org/@jona")).toBe("https://example.org/@jona");
    }
  });
  it("tags sovereign platforms independently of their original category", () => {
    for (const kind of ["eyou", "wsocial", "mastodon", "matrix", "signal", "pixelfed", "bluesky", "peertube", "lemmy", "misskey"]) {
      expect(BLOCK_KINDS.find((p) => p.kind === kind)?.tags).toContain("sovereign");
    }
  });
});
