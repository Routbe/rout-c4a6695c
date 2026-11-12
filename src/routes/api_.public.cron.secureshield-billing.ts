import { createFileRoute } from "@tanstack/react-router";

/**
 * Maandelijkse afschrijving van €0,09 per actieve SecureShield-relay.
 * Wordt aangeroepen door de scheduler; beveiligd met cronGuard (CRON_SECRET of LOVABLE_CRON_SECRET, constant-time).
 */
export const Route = createFileRoute("/api_/public/cron/secureshield-billing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { cronGuard } = await import("@/lib/cron-auth");
        const denied = await cronGuard(request);
        if (denied) return denied;

        const { chargeMonthlyRelays } = await import("@/lib/wallet.server");
        const result = await chargeMonthlyRelays();
        return Response.json(result);
      },
    },
  },
});
