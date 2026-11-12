import { createFileRoute } from "@tanstack/react-router";

/** GET /ai-manifest.json — universal, stateless discovery document for AI agents. */
export const Route = createFileRoute("/ai-manifest.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { publicOrigin } = await import("@/lib/agent/agent-auth.server");
        const { aiManifest } = await import("@/lib/agent/ai-manifest");
        return new Response(JSON.stringify(aiManifest(publicOrigin(request)), null, 2), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=3600",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
