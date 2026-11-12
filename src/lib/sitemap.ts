import type { DocCategory, DocEntry } from "@/lib/docs-catalog";

export type SitemapEntry = { path: string; lastmod?: string; changefreq: "daily" | "weekly" | "monthly" | "yearly"; priority: number };

/** Public, indexable app pages that are not MDX docs. Signed-in pages (dashboard, admin) never belong here. */
export const STATIC_SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: 1.0 },
  { path: "/discover", changefreq: "monthly", priority: 0.9 },
  { path: "/discover/profiles", changefreq: "monthly", priority: 0.8 },
  { path: "/discover/qr-studio", changefreq: "monthly", priority: 0.8 },
  { path: "/discover/links", changefreq: "monthly", priority: 0.8 },
  { path: "/discover/rout-id", changefreq: "monthly", priority: 0.8 },
  { path: "/discover/rout-card", changefreq: "monthly", priority: 0.8 },
  { path: "/discover/creator-support", changefreq: "monthly", priority: 0.8 },
  { path: "/discover/questions", changefreq: "monthly", priority: 0.8 },
  { path: "/discover/workspaces", changefreq: "monthly", priority: 0.8 },
  { path: "/discover/developers", changefreq: "monthly", priority: 0.8 },
  { path: "/discover/bookings", changefreq: "monthly", priority: 0.8 },
  { path: "/studio", changefreq: "monthly", priority: 1.0 },
  { path: "/contact", changefreq: "monthly", priority: 0.7 },
  { path: "/press", changefreq: "monthly", priority: 0.6 },
  { path: "/press/wallet", changefreq: "monthly", priority: 0.6 },
  { path: "/press/previews", changefreq: "monthly", priority: 0.6 },
  { path: "/explore", changefreq: "weekly", priority: 0.6 },
  { path: "/wifi-qr", changefreq: "monthly", priority: 0.7 },
  { path: "/vcard-qr", changefreq: "monthly", priority: 0.7 },
  ...["/data-deletion", "/manifesto", "/privacy", "/security", "/self-hosting", "/sovereignty", "/terms", "/status", "/developers", "/verify"].map(path => ({ path, changefreq: "monthly" as const, priority: 0.6 })),
  ...["/iban-qr", "/batch", "/signature", "/email-templates", "/gift", "/tour"].map(path => ({ path, changefreq: "monthly" as const, priority: 0.7 })),
];

const CATEGORY_RULES: Record<DocCategory, Pick<SitemapEntry, "changefreq" | "priority">> = {
  product: { changefreq: "monthly", priority: 0.9 },
  "qr-code-generator": { changefreq: "monthly", priority: 0.9 },
  features: { changefreq: "monthly", priority: 0.8 },
  solutions: { changefreq: "monthly", priority: 0.8 },
  guide: { changefreq: "weekly", priority: 0.8 },
  compare: { changefreq: "monthly", priority: 0.8 },
  support: { changefreq: "monthly", priority: 0.6 },
  about: { changefreq: "monthly", priority: 0.6 },
  info: { changefreq: "monthly", priority: 0.6 },
  dev: { changefreq: "monthly", priority: 0.6 },
  safety: { changefreq: "monthly", priority: 0.5 },
};

/** lastmod only comes from the page's own `last_updated` frontmatter, never the current date. */
export function docSitemapEntry(doc: Pick<DocEntry, "path" | "category" | "last_updated">): SitemapEntry {
  return { path: doc.path, lastmod: doc.last_updated, ...CATEGORY_RULES[doc.category] };
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function buildSitemapXml(origin: string, entries: SitemapEntry[]): string {
  const seen = new Set<string>();
  const urls = entries
    .filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)))
    .map((e) =>
      [
        "  <url>",
        `    <loc>${escapeXml(origin + e.path)}</loc>`,
        e.lastmod ? `    <lastmod>${escapeXml(e.lastmod)}</lastmod>` : null,
        `    <changefreq>${e.changefreq}</changefreq>`,
        `    <priority>${e.priority.toFixed(1)}</priority>`,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
