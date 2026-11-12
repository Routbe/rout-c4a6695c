import { createFileRoute } from "@tanstack/react-router";

/**
 * Hourly purge of agent-provisioned workspaces whose 24-hour claim window
 * expired unclaimed: the workspace and everything in it (OAuth apps, QR
 * codes, bookings, transfers) is hard-deleted. Protected by cronGuard (CRON_SECRET or LOVABLE_CRON_SECRET, constant-time).
 */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { purgeUnclaimedAgentWorkspaces } = await import("@/lib/agent/agent-workspaces.server");
  const purged = await purgeUnclaimedAgentWorkspaces();
  // Ephemeral vaults (1 h TTL) are hard-deleted on the same schedule.
  const { purgeExpiredEphemeralVaults } = await import("@/lib/vault/ephemeral-vault.server");
  const vaults = await purgeExpiredEphemeralVaults().catch(() => 0);
  return Response.json({ success: true, purged, vaults });
}

export const Route = createFileRoute("/api_/public/cron/purge-agent-workspaces")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
