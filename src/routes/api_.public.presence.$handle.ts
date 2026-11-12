import { createFileRoute } from "@tanstack/react-router";

/** Public, cached live status for a visible profile. Visitors never contact third-party platforms. */
export const Route = createFileRoute("/api_/public/presence/$handle")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "presence-public", 120, 60000);
        if (limited) return limited;
        const headers = { "cache-control": "public, max-age=15" };
        const handle = params.handle.replace(/^@/, "").slice(0, 64);
        try {
          const s = await import("@/lib/custom-presence.server");
          const owner = await s.publicPresenceOwner(handle);
          const status = owner ? await s.publicCustomStatus(owner) : null;
          return Response.json(status ? { online: true, status: status.statusText, icon: status.icon, category: status.category, expires_at: status.expiresAt } : { online: false }, { headers });
        } catch (e) {
          console.error("[presence]", e instanceof Error ? e.message : e);
          return Response.json({ online: false }, { headers });
        }
      },
    },
  },
});
