import { createFileRoute } from "@tanstack/react-router";

/**
 * Periodieke scan van openstaande overschrijvingen: houdt betalingen exact één
 * week open en verklaart ze daarna verlopen. Beveiligd met cronGuard (CRON_SECRET of LOVABLE_CRON_SECRET, constant-time).
 */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  try {
    const { runTransferWindowScan } = await import("@/lib/transfer-window.server");
    const result = await runTransferWindowScan();
    return Response.json({ success: true, ...result });
  } catch (err) {
    console.error("[cron/scan-transfers] mislukt", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response("Scan failed", { status: 500 });
  }
}

export const Route = createFileRoute("/api_/public/cron/scan-transfers")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
