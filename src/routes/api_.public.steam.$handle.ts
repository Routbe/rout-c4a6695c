import { createFileRoute } from "@tanstack/react-router";

/** Public, cached Steam status for an opted-in profile. Visitors never contact Steam. */
export const Route = createFileRoute("/api_/public/steam/$handle")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "steam-public", 120, 60000);
        if (limited) return limited;
        const headers = { "cache-control": "public, max-age=60" };
        const handle = params.handle.replace(/^@/, "").slice(0, 64);
        try {
          const s = await import("@/lib/steam-presence.server");
          const link = await s.publicSteamLink(handle);
          if (!link) return Response.json({ state: "offline" }, { headers });
          return Response.json(await s.steamStatusFor(link), { headers });
        } catch (e) {
          console.error("[steam-public]", e instanceof Error ? e.message : e);
          return Response.json({ state: "offline" }, { headers });
        }
      },
    },
  },
});
