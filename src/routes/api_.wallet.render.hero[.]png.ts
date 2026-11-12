import { createFileRoute } from "@tanstack/react-router";

/** Compatibility URL for the console: accepts public handles, never account IDs. */
export const Route = createFileRoute("/api_/wallet/render/hero.png")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const handle = (url.searchParams.get("id") ?? "").toLowerCase();
        if (!/^[a-z0-9._-]{1,100}$/.test(handle)) {
          return new Response("A public ROUT handle is required", { status: 400 });
        }
        // The existing renderer enforces publication and rejects unknown/private profiles.
        const destination = new URL(`/api/wallet/render/${encodeURIComponent(handle)}/hero.png`, url.origin);
        return Response.redirect(destination.toString(), 307);
      },
    },
  },
});