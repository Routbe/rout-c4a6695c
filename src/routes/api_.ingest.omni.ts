import { createFileRoute } from "@tanstack/react-router";

/** Compatibility path; external automations should use /api/public/ingest/omni. */
export const Route = createFileRoute("/api_/ingest/omni")({
  server: { handlers: { POST: async ({ request }) =>
    (await import("@/lib/omni-ingest-route.server")).handleIngestWebhook(request),
  } },
});