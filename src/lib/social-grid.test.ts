import { describe, expect, it } from "vitest";
import {
  SOCIAL_GRID_MAX_ITEMS,
  detectSocialGridTarget,
  isSocialGridMediaUrl,
  moveSocialGridItem,
  normalizeSocialGridBlocks,
  normalizeSocialGridTarget,
  orderedSocialGridItems,
  parseSocialGridConfig,
  serializeSocialGridConfig,
} from "./social-grid";

const upload = "/api/public/gallery-media?path=11111111-1111-4111-8111-111111111111%2Fa.webp";
const card = (over: Record<string, unknown> = {}) => ({ id: "a", mediaUrl: upload, platform: "instagram", ...over });

describe("social grid destination links", () => {
  it("accepts https links and same-site paths", () => {
    expect(normalizeSocialGridTarget("https://example.com/post")).toBe("https://example.com/post");
    expect(normalizeSocialGridTarget("/jouwnaam")).toBe("/jouwnaam");
  });
  it("adds https to a bare domain", () => {
    expect(normalizeSocialGridTarget("instagram.com/p/abc")).toBe("https://instagram.com/p/abc");
  });
  it("refuses http, scripts, protocol-relative and credential links", () => {
    for (const bad of ["http://example.com", "javascript:alert(1)", "data:text/html,x", "//evil.com", "/\\evil.com", "https://user:pw@example.com", "mailto:a@b.be"]) {
      expect(normalizeSocialGridTarget(bad)).toBeNull();
    }
  });
});

describe("social grid images", () => {
  it("allows only persisted first-party media, never a remote image proxy", () => {
    expect(isSocialGridMediaUrl(upload)).toBe(true);
    expect(isSocialGridMediaUrl("https://images.unsplash.com/photo-1")).toBe(false);
    expect(isSocialGridMediaUrl("https://tracker.example.com/pixel.png")).toBe(false);
    expect(isSocialGridMediaUrl("http://images.unsplash.com/photo-1")).toBe(false);
  });
  it("rejects malformed, duplicate and traversal-style media queries", () => {
    for (const invalid of ["/api/public/gallery-media?path=https://cdn.example.com/x.jpg", `${upload}&path=another`, `${upload}&url=https://cdn.example.com`, `${upload}#fragment`, "/api/public/gallery-media?path=../secret"]) expect(isSocialGridMediaUrl(invalid)).toBe(false);
  });
});

describe("social grid parsing", () => {
  it("drops cards with unsafe images and strips unsafe links", () => {
    const config = parseSocialGridConfig(JSON.stringify({
      title: "Grid",
      items: [card({ targetUrl: "javascript:alert(1)" }), card({ id: "b", mediaUrl: "https://evil.example/x.png" })],
    }));
    expect(config.items).toHaveLength(1);
    expect(config.items[0]?.targetUrl).toBeUndefined();
  });
  it("caps the grid at 30 cards", () => {
    const items = Array.from({ length: 40 }, (_, i) => card({ id: `c${i}` }));
    expect(parseSocialGridConfig(JSON.stringify({ items })).items).toHaveLength(SOCIAL_GRID_MAX_ITEMS);
    expect(SOCIAL_GRID_MAX_ITEMS).toBe(30);
  });
  it("falls back to 'custom' for an unknown platform and false for flags", () => {
    const [item] = parseSocialGridConfig(JSON.stringify({ items: [card({ platform: "myspace", isVideo: "yes" })] })).items;
    expect(item?.platform).toBe("custom");
    expect(item?.isVideo).toBe(false);
  });
  it("returns an empty grid for broken JSON", () => {
    expect(parseSocialGridConfig("{oops").items).toEqual([]);
  });
  it("uses semantic types for manual links and rejects remote kinetic previews", () => {
    const items = parseSocialGridConfig(JSON.stringify({ items: [card({ targetUrl: "https://open.spotify.com/show/1", kineticPreviewUrl: "https://cdn.example.com/a.webm" }), card({ id: "b", contentType: "event", isHero: true })] })).items;
    expect(items[0]?.contentType).toBe("podcast");
    expect(items[0]?.kineticPreviewUrl).toBeUndefined();
    expect(items[1]).toMatchObject({ contentType: "event", isHero: true });
  });
});

describe("social grid order", () => {
  it("puts pinned cards first and keeps the arranged order otherwise", () => {
    const items = parseSocialGridConfig(JSON.stringify({ items: [card({ id: "a" }), card({ id: "b", pinned: true }), card({ id: "c" })] })).items;
    expect(orderedSocialGridItems(items).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
  it("moves a card to a new position", () => {
    expect(moveSocialGridItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveSocialGridItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

describe("smart URL mapping", () => {
  it("recognises Instagram reels and TikTok videos", () => {
    expect(detectSocialGridTarget("https://www.instagram.com/reel/abc/")).toEqual({ platform: "instagram", isVideo: true });
    expect(detectSocialGridTarget("https://www.instagram.com/p/abc/")).toEqual({ platform: "instagram", isVideo: false });
    expect(detectSocialGridTarget("https://www.tiktok.com/@a/video/1")).toEqual({ platform: "tiktok", isVideo: true });
    expect(detectSocialGridTarget("https://blog.example.com/a")).toBeNull();
  });
});

describe("server normalization", () => {
  it("cleans only social grid blocks before a draft is saved", () => {
    const dirty = JSON.stringify({ items: [card({ targetUrl: "javascript:x" })] });
    const [grid, other] = normalizeSocialGridBlocks([
      { id: "1", kind: "social_grid", value: dirty },
      { id: "2", kind: "link", value: "javascript:x" },
    ]);
    expect(parseSocialGridConfig(grid?.value).items[0]?.targetUrl).toBeUndefined();
    expect(grid?.value).toBe(serializeSocialGridConfig(parseSocialGridConfig(dirty)));
    expect(other?.value).toBe("javascript:x");
  });
});
