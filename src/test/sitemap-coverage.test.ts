import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { docs } from "@/lib/docs-catalog";
import { STATIC_SITEMAP_ENTRIES, buildSitemapXml } from "@/lib/sitemap";

// Static-looking routes which are deliberately not generic, indexable content.
const EXCLUDED = new Set(["/auth", "/auth/bluesky", "/auth/continue", "/auth/mastodon/callback", "/signup", "/claim", "/card", "/hub", "/go", "/leaving", "/oauth/end-session"]);

describe("complete public sitemap coverage", () => {
  it("includes every public content route, including every About and Info article", () => {
    const included = new Set([...STATIC_SITEMAP_ENTRIES.map(e => e.path), ...docs.map(d => d.path)]);
    const missing: string[] = [];
    for (const file of readdirSync("src/routes")) {
      if (!/\.tsx?$/.test(file) || file === "__root.tsx") continue;
      const source = readFileSync(`src/routes/${file}`, "utf8");
      const match = /createFileRoute\(["']([^"']+)/.exec(source);
      if (!match?.[1]) continue;
      const raw = match[1];
      const path = raw.replace(/_(?=\/|$)/g, "").replace(/\/$/, "") || "/";
      if (raw.startsWith("/_authenticated") || raw.includes("$") || path.startsWith("/api/") || path.startsWith("/.well-known/") || /\.(xml|txt)$/.test(path) || EXCLUDED.has(path)) continue;
      if (!/component\s*:/.test(source) || /component:\s*Outlet/.test(source) || /noindex/.test(source)) continue;
      // Redirect-only aliases have no content component; '/' has a signed-in redirect and stays included.
      if (!included.has(path)) missing.push(path);
    }
    expect(missing).toEqual([]);
  });

  it("never invents lastmod for static pages without an authoritative content timestamp", () => {
    expect(buildSitemapXml("https://rout.be", STATIC_SITEMAP_ENTRIES)).not.toContain("<lastmod>");
  });

  it("never lists account workflows, identity-token pages or private aliases as static entries", () => {
    const paths = STATIC_SITEMAP_ENTRIES.map(e => e.path);
    for (const path of EXCLUDED) expect(paths).not.toContain(path);
    expect(paths.some(p => p.startsWith("/dashboard") || p.startsWith("/a/"))).toBe(false);
  });
});