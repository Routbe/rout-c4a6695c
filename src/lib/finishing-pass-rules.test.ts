import { describe, expect, it } from "vitest";
import { galleryUploadCount, isValidImageUrl } from "./gallery";
import { galleryImageSrc } from "./image-proxy-rules";
import { parseSocialFeedConfig } from "./social-feed";
import { DEFAULT_DISPLAY_PREFS, parseDisplayPrefs } from "./profile-display";

describe("gallery", () => {
  it("counts only uploads toward free storage, never image links", () => {
    expect(galleryUploadCount([
      { url: "/api/public/gallery-media?path=a" },
      { url: "https://images.unsplash.com/photo" },
    ])).toBe(1);
  });
  it("accepts only https image links", () => {
    expect(isValidImageUrl("http://images.unsplash.com/x")).toBe(false);
    expect(isValidImageUrl("https://images.unsplash.com/x")).toBe(true);
  });
  it("loads external images only through the privacy proxy", () => {
    expect(galleryImageSrc("https://images.unsplash.com/x")).toMatch(/^\/api\/public\/proxy-image\?url=/);
    expect(galleryImageSrc("https://evil.example/x.png")).toBeNull();
    expect(galleryImageSrc("/api/public/gallery-media?path=a")).toBe("/api/public/gallery-media?path=a");
  });
});

describe("social feed", () => {
  it("clamps posts to 1-12 and columns to 1-3", () => {
    expect(parseSocialFeedConfig('{"count":0,"columns":0}')).toMatchObject({ count: 1, columns: 1 });
    expect(parseSocialFeedConfig('{"count":99,"columns":99}')).toMatchObject({ count: 12, columns: 3 });
  });
});

describe("guestbook", () => {
  it("is off by default and only on with an explicit true", () => {
    expect(DEFAULT_DISPLAY_PREFS.guestbookEnabled).toBe(false);
    expect(parseDisplayPrefs({}).guestbookEnabled).toBe(false);
    expect(parseDisplayPrefs({ guestbookEnabled: "true" }).guestbookEnabled).toBe(false);
    expect(parseDisplayPrefs({ guestbookEnabled: true }).guestbookEnabled).toBe(true);
  });
});
