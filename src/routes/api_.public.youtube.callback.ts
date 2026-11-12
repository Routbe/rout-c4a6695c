import { createFileRoute } from "@tanstack/react-router";

/**
 * Google OAuth callback for the YouTube vault. Public by necessity: the signed
 * state (HMAC, 10 min) and the signed-in session must name the same member.
 */
export const Route = createFileRoute("/api_/public/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const back = (q: string) => new Response(null, { status: 302, headers: { location: `/studio?youtube=${q}` } });
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") ?? "";
        if (url.searchParams.get("error") || !code) return back("cancelled");
        const y = await import("@/lib/youtube.server");
        if (!y.youtubeConfigured()) return back("not_configured");
        const stateUser = y.verifyYouTubeState(state);
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!stateUser || !user || user.id !== stateUser) return back("invalid_state");
        try {
          await y.exchangeYouTubeCode(user.id, code, request);
          return back("connected");
        } catch (e) {
          console.error("[youtube] exchange failed", e instanceof Error ? e.message : "unknown");
          return back("failed");
        }
      },
    },
  },
});
