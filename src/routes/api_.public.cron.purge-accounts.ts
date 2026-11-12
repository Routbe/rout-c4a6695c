import { createFileRoute } from "@tanstack/react-router";

/** Daily purge of accounts whose 7-day grace period ended. Protected by cronGuard (CRON_SECRET or LOVABLE_CRON_SECRET, constant-time). */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { purgeDueDeletions } = await import("@/lib/account-deletion.server");
  return Response.json({ success: true, ...(await purgeDueDeletions()) });
}

export const Route = createFileRoute("/api_/public/cron/purge-accounts")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
