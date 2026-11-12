import { createFileRoute } from "@tanstack/react-router";

/**
 * Publiek visitekaartje van ROUT voor Bluesky. De AT Protocol-servers halen
 * dit bestand op om te weten wie er om toestemming vraagt en waar de gebruiker
 * daarna weer naartoe gestuurd mag worden.
 */
export const Route = createFileRoute("/api_/public/bluesky/client-metadata.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { canonicalAppUrl } = await import("@/lib/app-url");
        const { blueskyClientId, blueskyRedirectUri, BLUESKY_SCOPE } = await import(
          "@/lib/bluesky-auth.server"
        );
        const host = request.headers.get("host") ?? "";
        const { isApprovedHost } = await import("@/lib/app-url");
        const origin =
          process.env["NEXT_PUBLIC_APP_URL"]?.replace(/\/$/, "") ||
          (isApprovedHost(host) && !host.startsWith("localhost")
            ? `https://${host}`
            : canonicalAppUrl());

        return Response.json(
          {
            client_id: blueskyClientId(origin),
            client_name: "ROUT",
            client_uri: origin,
            logo_uri: `${origin}/icon-192.png`,
            policy_uri: `${origin}/privacy`,
            tos_uri: `${origin}/terms`,
            redirect_uris: [blueskyRedirectUri(origin)],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            scope: BLUESKY_SCOPE,
            application_type: "web",
            token_endpoint_auth_method: "none",
            dpop_bound_access_tokens: true,
          },
          { headers: { "cache-control": "public, max-age=300" } },
        );
      },
    },
  },
});
