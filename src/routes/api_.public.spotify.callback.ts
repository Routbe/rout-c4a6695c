import { createFileRoute } from "@tanstack/react-router";

/**
 * Spotify OAuth callback. Public by necessity: the signed state (HMAC, 10 min)
 * plus the signed-in session must name the same member before tokens are stored.
 */
export const Route = createFileRoute("/api_/public/spotify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const back = (q: string) => new Response(null, { status: 302, headers: { location: `/studio?spotify=${q}` } });
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") ?? "";
        if (url.searchParams.get("error") || !code) return back("cancelled");
        const s = await import("@/lib/spotify-presence.server");
        if (!s.spotifyConfigured()) return back("not_configured");
        const stateUser = s.verifySpotifyState(state);
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!stateUser || !user || user.id !== stateUser) return back("invalid_state");
        try {
          await s.exchangeSpotifyCode(user.id, code, request);
          return back("connected");
        } catch (e) {
          console.error("[spotify] exchange failed", e instanceof Error ? e.message : e);
          return back("failed");
        }
      },
    },
  },
});
