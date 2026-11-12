import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/audit/revert/<logId> — one-click undo of an agent action.
 * Signed-in workspace owners/admins only (session, never an agent token):
 * the human reverts what the AI did. Each log entry reverts exactly once.
 */
export const Route = createFileRoute("/api_/audit/revert/$logId")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser();
        if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (!/^[0-9a-f-]{36}$/i.test(params.logId)) {
          return Response.json({ error: "Ongeldige log-id." }, { status: 400 });
        }
        const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit.server");
        try {
          enforceRateLimit(`audit-revert:${user.id}`, 20, 60_000);
          const { revertAgentMutation } = await import("@/lib/agent/chronos.server");
          const result = await revertAgentMutation(user.id, params.logId);
          return Response.json(result);
        } catch (error) {
          if (error instanceof RateLimitError) {
            return Response.json({ error: error.message }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } });
          }
          const { RevertError } = await import("@/lib/agent/chronos.server");
          if (error instanceof RevertError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error("[audit-revert]", error);
          return Response.json({ error: "Terugdraaien is tijdelijk niet beschikbaar." }, { status: 500 });
        }
      },
    },
  },
});
