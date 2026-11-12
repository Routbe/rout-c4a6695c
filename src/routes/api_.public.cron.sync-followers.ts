import { createFileRoute } from "@tanstack/react-router";

/**
 * Achtergrond-sync van volgeraantallen (0-kost: open API's + OpenGraph).
 * Beveiligd met cronGuard (CRON_SECRET of LOVABLE_CRON_SECRET, constant-time).
 */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { syncFollowersBatch } = await import("@/lib/total-reach.server");
  const result = await syncFollowersBatch();
  return Response.json(result);
}

export const Route = createFileRoute("/api_/public/cron/sync-followers")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
