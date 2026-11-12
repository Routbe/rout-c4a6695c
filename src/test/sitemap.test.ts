import { expect, it } from "vitest";
import { STATIC_SITEMAP_ENTRIES, buildSitemapXml, docSitemapEntry } from "@/lib/sitemap";

it("gives the home page priority 1.0", () => {
  expect(STATIC_SITEMAP_ENTRIES.find((e) => e.path === "/")?.priority).toBe(1.0);
});

it("gives product pages priority 0.9 and guides 0.8 with weekly changes", () => {
  expect(docSitemapEntry({ path: "/product/batch-engine", category: "product", last_updated: "2026-10-01" }).priority).toBe(0.9);
  const guide = docSitemapEntry({ path: "/guide/print-qr-code", category: "guide", last_updated: "2026-10-02" });
  expect(guide.priority).toBe(0.8);
  expect(guide.changefreq).toBe("weekly");
});

it("uses the page's own last_updated date as lastmod", () => {
  expect(docSitemapEntry({ path: "/compare/bitly-alternative", category: "compare", last_updated: "2026-09-15" }).lastmod).toBe("2026-09-15");
});

it("never lists signed-in pages", () => {
  expect(STATIC_SITEMAP_ENTRIES.map((e) => e.path)).not.toContain("/dashboard");
});

it("includes the public Wallet and preview artwork pages", () => {
  expect(STATIC_SITEMAP_ENTRIES.map(e => e.path)).toContain("/press/wallet");
  expect(STATIC_SITEMAP_ENTRIES.map(e => e.path)).toContain("/press/previews");
});

it("writes absolute rout.be URLs once each", () => {
  const xml = buildSitemapXml("https://rout.be", [
    { path: "/", changefreq: "weekly", priority: 1 },
    { path: "/", changefreq: "weekly", priority: 1 },
  ]);
  expect(xml.match(/<loc>https:\/\/rout\.be\/<\/loc>/g)).toHaveLength(1);
});
