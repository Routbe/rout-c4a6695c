import { describe, expect, it } from "vitest";
import { classifyOmniUrl, discoverOEmbed, galleryMediaUrl, ingestPayloadSchema, isLocalOmniMediaUrl, readyOmniItem, type OmniJob } from "./omni-ingest";

const job: OmniJob = { id: "11111111-1111-4111-8111-111111111111", source: "studio", sourceUrl: "https://example.com/story", status: "ready", contentType: "article", title: "Story", metaTag: "5 min", targetUrl: "https://example.com/story", mediaUrl: galleryMediaUrl("22222222-2222-4222-8222-222222222222/omni-cover.webp"), kineticPreviewUrl: null, error: null, createdAt: "2026-11-03T00:00:00.000Z" };

describe("Omni-Matrix rules", () => {
  it("accepts only persisted local ingestion media", () => {
    expect(isLocalOmniMediaUrl(job.mediaUrl ?? "")).toBe(true);
    expect(isLocalOmniMediaUrl("https://cdn.example.com/cover.webp")).toBe(false);
    expect(isLocalOmniMediaUrl("/api/public/gallery-media?path=https%3A%2F%2Fcdn.example.com")).toBe(false);
  });
  it("does not turn unfinished or remote-image jobs into cards", () => {
    expect(readyOmniItem({ ...job, status: "processing" })).toBeNull();
    expect(readyOmniItem({ ...job, mediaUrl: "https://cdn.example.com/cover.webp" })).toBeNull();
  });
  it("preserves article semantics and metadata when importing a ready job", () => {
    expect(readyOmniItem(job)).toMatchObject({ contentType: "article", caption: "Story", metaTag: "5 min", isHero: false });
  });
  it.each([
    ["https://podcasts.apple.com/show", "podcast"],
    ["https://youtube.com/watch?v=abcdef12345", "program"],
    ["https://youtube.com/shorts/abcdef12345", "short"],
    ["https://meetup.com/event", "event"],
    ["https://instagram.com/p/example", "social"],
    ["https://example.com/news", "article"],
  ])("classifies %s as %s", (url, type) => expect(classifyOmniUrl(url)).toBe(type));
  it("rejects credential URLs and HTTP ingestion", () => {
    expect(ingestPayloadSchema.safeParse({ target_url: "http://example.com" }).success).toBe(false);
    expect(ingestPayloadSchema.safeParse({ target_url: "https://user:password@example.com" }).success).toBe(false);
  });
  it("discovers JSON oEmbed without accepting script URLs", () => {
    expect(discoverOEmbed('<link type="application/json+oembed" href="/oembed?x=1&amp;y=2">', "https://example.com")).toBe("https://example.com/oembed?x=1&y=2");
    expect(discoverOEmbed('<link type="application/json+oembed" href="javascript:alert(1)">', "https://example.com")).toBeNull();
  });
});