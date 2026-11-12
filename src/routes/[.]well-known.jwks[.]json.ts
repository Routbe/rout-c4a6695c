import { createFileRoute } from "@tanstack/react-router";

/** Publieke sleutels waarmee apps een ROUT-id-token kunnen verifiëren. */
export const Route = createFileRoute("/.well-known/jwks.json")({
  server: {
    handlers: {
      GET: async () => {
        try {
        const { publicJwks } = await import("@/lib/oauth/provider.server");
        const { hybridReadyJwks } = await import("@/lib/security/hybrid-jwks");
        return Response.json(hybridReadyJwks(await publicJwks()), {
          headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
        });
        } catch {
          console.error("[jwks] signing_keys_unavailable");
          return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
        }
      },
    },
  },
});
