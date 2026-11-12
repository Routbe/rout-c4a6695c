import { createFileRoute } from "@tanstack/react-router";

/** Push mailbox for automations (Make.com, n8n, CMS). See omni-ingest-route.server.ts. */
export const Route = createFileRoute("/api_/public/ingest/grid")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/lib/omni-ingest-route.server")).handleIngestWebhook(request),
    },
  },
});
