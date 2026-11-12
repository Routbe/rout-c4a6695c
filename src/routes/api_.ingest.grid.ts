import { createFileRoute } from "@tanstack/react-router";

/** Compatibility path; external automations should use /api/public/ingest/grid. */
export const Route = createFileRoute("/api_/ingest/grid")({
  server: { handlers: { POST: async ({ request }) =>
    (await import("@/lib/omni-ingest-route.server")).handleIngestWebhook(request),
  } },
});