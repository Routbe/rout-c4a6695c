import { createFileRoute } from "@tanstack/react-router";

/**
 * AT Protocol handle verification for every subdomain variant
 * (`[alias].u.rout.be`, `[handle].r.rout.be`, `[handle].rout.be`).
 * Answers the raw DID as text/plain, or 404 "DID not configured".
 */
export const Route = createFileRoute("/.well-known/atproto-did")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleAtprotoDidRequest } = await import("@/lib/subdomain.server");
        const response = await handleAtprotoDidRequest(request);
        return (
          response ??
          new Response("DID not configured", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
          })
        );
      },
    },
  },
});
