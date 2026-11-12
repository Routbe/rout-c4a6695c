import { createFileRoute } from "@tanstack/react-router";

/** Starts the YouTube vault link (youtube.readonly) for the signed-in member. */
export const Route = createFileRoute("/api_/youtube/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const back = (q: string) => new Response(null, { status: 302, headers: { location: `/studio?youtube=${q}` } });
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return new Response(null, { status: 302, headers: { location: "/auth/sign-in?next=/studio" } });
        const y = await import("@/lib/youtube.server");
        if (!y.youtubeConfigured()) {
          console.warn("[youtube] not configured, missing:", y.youtubeMissingKeys().join(", "));
          return back("not_configured");
        }
        return new Response(null, { status: 302, headers: { location: y.youtubeAuthorizeUrl(user.id, request) } });
      },
    },
  },
});
