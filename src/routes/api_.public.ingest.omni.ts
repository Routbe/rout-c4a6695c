import { createFileRoute } from "@tanstack/react-router";

/** Same token-authenticated mailbox as /api/public/ingest/grid. */
export const Route = createFileRoute("/api_/public/ingest/omni")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/lib/omni-ingest-route.server")).handleIngestWebhook(request),
    },
  },
});
