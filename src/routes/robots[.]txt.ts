import { createFileRoute } from "@tanstack/react-router";
import body from "@/content/seo/robots.txt?raw";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { SEO_CACHE_HEADERS } = await import("@/lib/sitemap-index.server");
        return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", ...SEO_CACHE_HEADERS } });
      },
    },
  },
});
