import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/neon", () => ({ sql: { query } }));
import { calendarEntries, profileEntries, readSitemapPages, sitemapResponse, SITEMAP_PAGE_SIZE } from "@/lib/sitemap-index.server";

beforeEach(() => { query.mockReset(); });

describe("sitemap pagination and privacy", () => {
  it("reads the next page instead of silently dropping the 1001st public row", async () => {
    const first = Array.from({ length: SITEMAP_PAGE_SIZE }, (_, i) => ({ username: `member${String(i).padStart(4, "0")}` }));
    const fetchPage = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce([{ username: "member1000" }]);
    const rows = await readSitemapPages(fetchPage, "username");
    expect(rows).toHaveLength(1001);
    expect(rows.at(-1)?.["username"]).toBe("member1000");
    expect(fetchPage).toHaveBeenLastCalledWith("member0999", 1000);
  });

  it("rejects a non-advancing source instead of serving incomplete XML", async () => {
    const page = Array.from({ length: 1000 }, () => ({ username: "same" }));
    await expect(readSitemapPages(vi.fn().mockResolvedValue(page), "username")).rejects.toThrow("did not advance");
  });

  it("preserves page-specific profile timestamps and canonical handles", async () => {
    query.mockResolvedValueOnce([{ username: "jona", url_style: "clean_at", updated_at: "2026-10-02T12:00:00Z" }]);
    expect(await profileEntries()).toEqual([{ path: "/@jona", lastmod: "2026-10-02", changefreq: "weekly", priority: 0.8 }]);
  });

  it("requires the same banned/frozen/private/root exclusions for profiles and calendars", async () => {
    query.mockResolvedValue([]);
    await profileEntries(); await calendarEntries();
    for (const [sql] of query.mock.calls) {
      for (const rule of ["p.verified is true", "p.is_banned", "p.is_shadowbanned", "'frozen', 'banned', 'suspended'", "p.workspace_id is null", "publicProfile"]) expect(sql).toContain(rule);
    }
    const calendarSql = query.mock.calls[1]?.[0];
    expect(calendarSql).toContain("c.mode = 'linked'");
    expect(calendarSql).toContain("public.booking_event_types");
    expect(calendarSql).toContain("t.is_active");
  });

  it("returns retryable non-cacheable failure when the public data query fails", async () => {
    query.mockRejectedValueOnce(new Error("Unavailable"));
    const response = await sitemapResponse("https://rout.be", "profiles");
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("600");
    expect(await response.text()).not.toContain("<urlset");
  });
});