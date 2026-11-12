import { createFileRoute } from "@tanstack/react-router";

/** Deletes logins of converted accounts past their 30-day sunset. Protected by cronGuard (CRON_SECRET or LOVABLE_CRON_SECRET, constant-time). */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { scrubSunsetAccounts } = await import("@/lib/workspace-conversion.server");
  return Response.json({ success: true, ...(await scrubSunsetAccounts()) });
}

export const Route = createFileRoute("/api_/public/cron/sunset-scrubber")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
