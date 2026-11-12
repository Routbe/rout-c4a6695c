import { createFileRoute } from "@tanstack/react-router";

/** Smart live link: 302 to the active YouTube stream, otherwise back to the profile. */
export const Route = createFileRoute("/$username_/live")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const handle = String(params.username ?? "").replace(/^@/, "").toLowerCase().slice(0, 64);
        const profile = `/${handle}`;
        try {
          const y = await import("@/lib/youtube.server");
          const { liveRedirectTarget } = await import("@/lib/youtube-presence");
          const owner = /^[a-z0-9_.-]{1,64}$/.test(handle) ? await y.publicYouTubeOwner(handle) : null;
          const presence = owner ? await y.youtubePresence(owner) : { isLive: false, videoId: null, title: null };
          return new Response(null, { status: 302, headers: { location: liveRedirectTarget(presence, profile), "cache-control": "no-store" } });
        } catch {
          return new Response(null, { status: 302, headers: { location: profile } });
        }
      },
    },
  },
});
