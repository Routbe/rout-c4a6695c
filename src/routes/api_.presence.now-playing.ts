import { createFileRoute } from "@tanstack/react-router";

/** Public "Now Playing" for a handle — only when the member opted in. */
export const Route = createFileRoute("/api_/presence/now-playing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "now-playing", 120, 60000);
        if (limited) return limited;
        const handle = (new URL(request.url).searchParams.get("handle") ?? "").replace(/^@/, "").slice(0, 64);
        const headers = { "cache-control": "public, max-age=5" };
        if (!handle) return Response.json({ playing: false }, { headers });
        try {
          const s = await import("@/lib/spotify-presence.server");
          if (!s.spotifyConfigured()) return Response.json({ playing: false }, { headers });
          const owner = await s.publicSpotifyOwner(handle);
          if (!owner) return Response.json({ playing: false }, { headers });
          return Response.json(await s.cachedNowPlaying(owner), { headers });
        } catch (e) {
          console.error("[now-playing]", e instanceof Error ? e.message : e);
          return Response.json({ playing: false }, { headers });
        }
      },
    },
  },
});
