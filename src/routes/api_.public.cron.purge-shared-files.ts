import { createFileRoute } from "@tanstack/react-router";

/** Cleanup of expired QR-shared files (Scaleway + Neon). Header: CRON_SECRET or LOVABLE_CRON_SECRET. */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { purgeExpiredSharedFiles } = await import("@/lib/storage/shared-files.server");
  return Response.json({ success: true, ...(await purgeExpiredSharedFiles()) });
}

export const Route = createFileRoute("/api_/public/cron/purge-shared-files")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
