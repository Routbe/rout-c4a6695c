import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/site";

export const Route = createFileRoute("/sitemap-calendars.xml")({
  server: { handlers: { GET: async () => (await import("@/lib/sitemap-index.server")).sitemapResponse(SITE_ORIGIN, "calendars") } },
});
