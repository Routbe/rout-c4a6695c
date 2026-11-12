import { createFileRoute } from "@tanstack/react-router";

/**
 * PUT /api/agent/sandbox/apps (Bearer rsk_…) — replace the ROUT login-app
 * specs (max 3). They stay specs until a human claims the workspace; the
 * claimer then becomes the owner of real, active OAuth clients.
 */
export const Route = createFileRoute("/api_/agent/sandbox_/apps")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const { authenticateSandbox, setSandboxApps } = await import("@/lib/agent/agent-sandbox.server");
        const ctx = await authenticateSandbox(request);
        if (ctx instanceof Response) return ctx;
        const { agentError, agentOk } = await import("@/lib/agent/responses");
        if (!ctx.workspaceId) return agentError(404, "not_found", "Create the workspace first.");
        const { sandboxAppsInput } = await import("@/lib/agent/agent-sandbox");
        const rawBody: unknown = await request.json().catch(() => null);
        const parsed = sandboxAppsInput.safeParse(rawBody);
        if (!parsed.success) return (await import("@/lib/agent/responses")).agentValidationError(parsed.error, rawBody);
        try {
          const n = await setSandboxApps(ctx, parsed.data.apps);
          return agentOk({ apps: n, note: "Apps go live with a client secret only after the human claims the workspace." });
        } catch {
          return agentError(400, "invalid_request", "The workspace is no longer editable (claimed or expired).");
        }
      },
    },
  },
});
