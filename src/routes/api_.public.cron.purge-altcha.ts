import { createFileRoute } from "@tanstack/react-router";

/** Cleanup of expired ALTCHA replay rows. Protected by cronGuard (CRON_SECRET or LOVABLE_CRON_SECRET, constant-time). */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { purgeExpiredAltcha } = await import("@/lib/altcha.server");
  return Response.json({ success: true, ...(await purgeExpiredAltcha()) });
}

export const Route = createFileRoute("/api_/public/cron/purge-altcha")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
