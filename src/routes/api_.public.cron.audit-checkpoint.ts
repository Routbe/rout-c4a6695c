import { createFileRoute } from "@tanstack/react-router";

/** Daily signed audit checkpoint + 365-day retention. Protected by cronGuard (CRON_SECRET or LOVABLE_CRON_SECRET, constant-time). */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;
  if (!process.env["ROUT_AUDIT_SIGNING_SECRET"]) {
    return new Response("ROUT_AUDIT_SIGNING_SECRET missing", { status: 503 });
  }

  const { createDailyCheckpoint, purgeExpiredAuditRows } = await import("@/lib/audit-log.server");
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const checkpoint = await createDailyCheckpoint(yesterday);
  const purged = await purgeExpiredAuditRows();
  return Response.json({ success: true, checkpoint, purged });
}

export const Route = createFileRoute("/api_/public/cron/audit-checkpoint")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
