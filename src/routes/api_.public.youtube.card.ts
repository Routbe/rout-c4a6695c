import { createFileRoute } from "@tanstack/react-router";

/** Public YouTube card for a handle — only when linked, visible and the profile is public. */
export const Route = createFileRoute("/api_/public/youtube/card")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "youtube-card", 120, 60000);
        if (limited) return limited;
        const handle = (new URL(request.url).searchParams.get("handle") ?? "").replace(/^@/, "").slice(0, 64);
        const headers = { "cache-control": "public, max-age=300" };
        if (!/^[a-z0-9_.-]{1,64}$/i.test(handle)) return Response.json({ card: null }, { headers });
        try {
          const y = await import("@/lib/youtube.server");
          if (!y.youtubeConfigured()) return Response.json({ card: null }, { headers });
          const owner = await y.publicYouTubeOwner(handle);
          if (!owner) return Response.json({ card: null }, { headers });
          const [card, presence] = await Promise.all([y.cachedCard(owner), y.youtubePresence(owner).catch(() => null)]);
          const live = presence?.isLive && presence.videoId ? { videoId: presence.videoId, title: presence.title ?? "" } : null;
          return Response.json({ card, live }, { headers: { "cache-control": "public, max-age=60" } });
        } catch (e) {
          console.error("[youtube-card]", e instanceof Error ? e.message : "unknown");
          return Response.json({ card: null }, { headers });
        }
      },
    },
  },
});
