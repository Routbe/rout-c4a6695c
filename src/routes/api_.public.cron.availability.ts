import { createFileRoute } from "@tanstack/react-router";

/** Booking engine worker: sync ICS/CalDAV, release stale holds, recompute availability. Protected by cronGuard. */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { syncDueCalendars, runDueJobs } = await import("@/lib/booking-engine/recompute.server");
  const { releaseExpiredHolds } = await import("@/lib/booking-engine/book.server");
  const sync = await syncDueCalendars().catch((e: unknown) => ({ error: e instanceof Error ? e.message : "error" }));
  const released = await releaseExpiredHolds();
  const jobs = await runDueJobs();
  return Response.json({ success: true, sync, released, jobs });
}

export const Route = createFileRoute("/api_/public/cron/availability")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
