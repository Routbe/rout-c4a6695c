import { createFileRoute } from "@tanstack/react-router";

/** Starts the Spotify Live Presence link for the signed-in member. */
export const Route = createFileRoute("/api_/spotify/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const back = (q: string) => new Response(null, { status: 302, headers: { location: `/studio?spotify=${q}` } });
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return new Response(null, { status: 302, headers: { location: "/auth/sign-in?next=/studio" } });
        const s = await import("@/lib/spotify-presence.server");
        if (!s.spotifyConfigured()) {
          console.warn("[spotify] not configured, missing:", s.spotifyMissingKeys().join(", "));
          return back("not_configured");
        }
        return new Response(null, { status: 302, headers: { location: s.spotifyAuthorizeUrl(user.id, request) } });
      },
    },
  },
});
