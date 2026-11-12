import { createFileRoute } from "@tanstack/react-router";

/**
 * PATCH /api/agent/sandbox/profile (Bearer rsk_…) — design the workspace's
 * Studio draft: name, tagline, theme, card style, blocks and display
 * preferences. Same storage as the Studio, so the owner sees exactly this
 * design after claiming. Never public before a claim and a human publish.
 */
export const Route = createFileRoute("/api_/agent/sandbox_/profile")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const { authenticateSandbox, patchSandboxProfile } = await import("@/lib/agent/agent-sandbox.server");
        const ctx = await authenticateSandbox(request);
        if (ctx instanceof Response) return ctx;
        const { agentError, agentOk } = await import("@/lib/agent/responses");
        if (!ctx.workspaceId) return agentError(404, "not_found", "Create the workspace first.");
        const { sandboxProfileInput, splitProfilePatch } = await import("@/lib/agent/agent-sandbox");
        const rawBody: unknown = await request.json().catch(() => null);
        const parsed = sandboxProfileInput.safeParse(rawBody);
        if (!parsed.success) return (await import("@/lib/agent/responses")).agentValidationError(parsed.error, rawBody);
        try {
          const { fields, prefs } = splitProfilePatch(parsed.data);
          const revision = await patchSandboxProfile(ctx, fields, prefs);
          return agentOk({ revision });
        } catch (error) {
          if ((error as Error)?.message === "draft_conflict") {
            return agentError(409, "draft_conflict", "Another patch landed at the same time. GET the workspace, re-apply your change and send patches one at a time.");
          }
          return agentError(400, "invalid_request", "The workspace is no longer editable (claimed or expired).");
        }
      },
    },
  },
});
