import { createFileRoute } from "@tanstack/react-router";

/** GET /.well-known/openapi.json — the agent API, machine-readable. */
export const Route = createFileRoute("/.well-known/openapi.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { agentOpenApi } = await import("@/lib/agent/openapi");
        const { publicOrigin } = await import("@/lib/agent/agent-auth.server");
        return new Response(JSON.stringify(agentOpenApi(publicOrigin(request)), null, 2), {
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
