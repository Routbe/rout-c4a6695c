import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/v1/ledger/streams/:streamId?after=<seq>&limit=<n> — signed events
 * (ciphertext) of one stream, for the controller or a `ledger.read` delegate.
 */
export const Route = createFileRoute("/api_/v1/ledger/streams/$streamId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "ledger-read", 240, 60_000);
        if (limited) return limited;
        const { handleRead, ledgerError, neonLedgerStore } = await import("@/lib/protocol/ledger.server");
        try {
          return await handleRead(request, decodeURIComponent(params.streamId), await neonLedgerStore(), { publicOrigin: process.env["PUBLIC_ORIGIN"] ?? null });
        } catch (err) {
          console.error("[ledger] read failed", err);
          return ledgerError(503, "ledger_unavailable");
        }
      },
    },
  },
});
