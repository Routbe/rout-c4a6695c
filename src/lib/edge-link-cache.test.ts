import { describe, expect, it } from "vitest";
import { LINK_CACHE_TTL_MS, MemoryLinkCache } from "./edge-link-cache";

describe("edge link cache", () => {
  it("serves a resolved link for 15 seconds, then forgets it", () => {
    let now = 0;
    const cache = new MemoryLinkCache(LINK_CACHE_TTL_MS, 10, () => now);
    cache.set("abc", { id: "1", targetUrl: "https://example.com" });
    now = 14_999;
    expect(cache.get("abc")?.targetUrl).toBe("https://example.com");
    now = 15_000;
    expect(cache.get("abc")).toBeNull();
  });

  it("evicts the oldest entry when full", () => {
    const cache = new MemoryLinkCache(60_000, 2, () => 0);
    cache.set("a", { id: "1", targetUrl: "https://a.be" });
    cache.set("b", { id: "2", targetUrl: "https://b.be" });
    cache.set("c", { id: "3", targetUrl: "https://c.be" });
    expect(cache.get("a")).toBeNull();
    expect(cache.size).toBe(2);
  });
});
