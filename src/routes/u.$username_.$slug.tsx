import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/ShortLink";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";

/**
 * `rout.be/u/<alias>/<code>` — eigen korte link van een gratis profiel.
 *
 * Zelfde principe als de geverifieerde variant: de slug in de databank is het
 * volledige pad zonder leading slash (`u/jona/apple`).
 */
export const Route = createFileRoute("/u/$username_/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params, next }) => {
        const { resolveShortLink, redirectResponse, rateLimitedResponse, pausedResponse } =
          await import("@/lib/short-link-redirect.server");
        const { RateLimitError } = await import("@/lib/rate-limit.server");
        const alias = sanitizeHandleInput(params.username);
        try {
          const result = await resolveShortLink(`u/${alias}/${params.slug}`, request);
          if (result?.status === "ok") return redirectResponse(result.targetUrl);
          if (result?.status === "paused") return pausedResponse(request);
        } catch (error) {
          if (error instanceof RateLimitError) {
            return rateLimitedResponse(error.retryAfterSeconds);
          }
        }
        return next();
      },
    },
  },
  head: ({ params }) => ({
    meta: [
      { title: `Link van @${params.username} | ROUT` },
      { name: "description", content: "Een korte link of QR-code van een ROUT-profiel." },
      { property: "og:title", content: `Link van @${params.username} | ROUT` },
      { property: "og:description", content: "Een korte link of QR-code van een ROUT-profiel." },
      { property: "og:image", content: "https://rout.be/brand/og/home-nl.png?v=3" },
      { name: "twitter:image", content: "https://rout.be/brand/og/home-nl.png?v=3" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});
