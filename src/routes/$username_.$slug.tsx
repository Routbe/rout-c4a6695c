import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/ShortLink";

/**
 * `rout.be/<handle>/<code>` — eigen korte link van een geverifieerd account.
 *
 * Eigen codes leven nooit in de root: ze hangen onder de handle van hun
 * eigenaar, zodat niemand een handle of systeemroute kan kapen. De slug in de
 * databank is exact dit pad zonder leading slash (`jdelplanche/apple`).
 */
export const Route = createFileRoute("/$username_/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params, next }) => {
        const { resolveShortLink, redirectResponse, rateLimitedResponse, pausedResponse } =
          await import("@/lib/short-link-redirect.server");
        const { RateLimitError } = await import("@/lib/rate-limit.server");
        const handle = params.username.replace(/^@/, "").toLowerCase();
        try {
          const result = await resolveShortLink(`${handle}/${params.slug}`, request);
          if (result?.status === "ok") return redirectResponse(result.targetUrl);
          if (result?.status === "paused") return pausedResponse(request);
        } catch (error) {
          if (error instanceof RateLimitError) {
            return rateLimitedResponse(error.retryAfterSeconds);
          }
        }
        // Front QR of the ROUT Card: rout.be/<handle>/<6 digits> (older cards: 4). Scanning with a phone
        // always opens the public profile; partners check freshness via /api/public/card-check.
        if (/^(?:\d{4}|\d{6})$/.test(params.slug) && /^[\w.-]{1,100}$/.test(handle)) {
          return new Response(null, { status: 302, headers: { location: `/${handle}`, "cache-control": "no-store" } });
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
