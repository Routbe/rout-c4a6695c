import { createFileRoute } from "@tanstack/react-router";

/** Delivers due outbound webhooks (signed, with backoff). Protected by cronGuard (CRON_SECRET or LOVABLE_CRON_SECRET, constant-time). */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { deliverDueWebhooks } = await import("@/lib/webhooks/webhooks.server");
  return Response.json({ success: true, ...(await deliverDueWebhooks()) });
}

export const Route = createFileRoute("/api_/public/cron/deliver-webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
