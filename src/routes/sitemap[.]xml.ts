import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/site";

/** Sitemap index pointing at the static, profile, workspace and calendar sub-sitemaps. */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { SEO_CACHE_HEADERS, buildSitemapIndexXml } = await import("@/lib/sitemap-index.server");
        return new Response(buildSitemapIndexXml(SITE_ORIGIN), {
          headers: { "Content-Type": "application/xml; charset=utf-8", ...SEO_CACHE_HEADERS },
        });
      },
    },
  },
});
