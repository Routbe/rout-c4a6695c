import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/ledger/events — append one signed, Merkle-chained event.
 * Body `{ event, capability? }`; header `DPoP: <proof signed by event.author>`.
 * No cookies, sessions or bearer keys: the signature is the authorisation.
 */
export const Route = createFileRoute("/api_/v1/ledger/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "ledger-append", 120, 60_000);
        if (limited) return limited;
        const { handleAppend, ledgerError, neonLedgerStore } = await import("@/lib/protocol/ledger.server");
        try {
          return await handleAppend(request, await neonLedgerStore(), { publicOrigin: process.env["PUBLIC_ORIGIN"] ?? null });
        } catch (err) {
          console.error("[ledger] append failed", err);
          return ledgerError(503, "ledger_unavailable");
        }
      },
    },
  },
});
