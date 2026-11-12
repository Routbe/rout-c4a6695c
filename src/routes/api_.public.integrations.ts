import { createFileRoute } from "@tanstack/react-router";

/** Public Connections Hub cards for a profile (respects publicProfile + Pro/Social face). */
export const Route = createFileRoute("/api_/public/integrations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "integrations", 120, 60000);
        if (limited) return limited;
        const params = new URL(request.url).searchParams;
        const handle = (params.get("handle") ?? "").replace(/^@/, "").slice(0, 64);
        const m = params.get("mode");
        const mode = m === "pro" || m === "social" ? m : null;
        const headers = { "cache-control": "public, max-age=60" };
        if (!handle) return Response.json({ items: [] }, { headers });
        try {
          const s = await import("@/lib/integrations.server");
          return Response.json({ items: await s.publicIntegrations(handle, mode) }, { headers });
        } catch (e) {
          console.error("[integrations] public failed", e instanceof Error ? e.message : e);
          return Response.json({ items: [] }, { headers });
        }
      },
    },
  },
});
