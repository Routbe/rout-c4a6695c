import { createFileRoute } from "@tanstack/react-router";
import { agentProvisionInput, claimUrl, provisionFailure } from "@/lib/agent/agent-claims";

/**
 * POST /api/agent/workspaces — scope `assets:write`.
 * Creates an unowned staging workspace for an AI agent. Zero e-mail: the body
 * schema rejects any address field; ROUT never mails about agent workspaces.
 * The answer carries the claim token exactly once — the agent delivers the
 * claim link to its human. Unclaimed after 24 hours, the workspace is
 * hard-deleted by the purge cron.
 */
export const Route = createFileRoute("/api_/agent/workspaces")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateAgent, publicOrigin } = await import("@/lib/agent/agent-auth.server");
        const agent = await authenticateAgent(request, "assets:write");
        if (agent instanceof Response) return agent;
        const { agentError, agentOk } = await import("@/lib/agent/responses");
        const rawBody: unknown = await request.json().catch(() => null);
        const parsed = agentProvisionInput.safeParse(rawBody);
        if (!parsed.success) return (await import("@/lib/agent/responses")).agentValidationError(parsed.error, rawBody);
        try {
          const { provisionAgentWorkspace } = await import("@/lib/agent/agent-workspaces.server");
          const ws = await provisionAgentWorkspace({
            userId: agent.userId,
            clientId: agent.clientId,
            name: parsed.data.name,
            slug: parsed.data.slug,
            description: parsed.data.description,
          });
          const { recordAgentMutation } = await import("@/lib/agent/chronos.server");
          await recordAgentMutation({
            workspaceId: ws.workspaceId,
            userId: agent.userId,
            clientId: agent.clientId,
            action: "workspace.provision",
            targetTable: "workspaces",
            targetId: ws.workspaceId,
            newState: { name: parsed.data.name, slug: ws.slug },
          });
          return agentOk(
            {
              workspace_id: ws.workspaceId,
              slug: ws.slug,
              claim_token: ws.claimToken,
              claim_url: claimUrl(publicOrigin(request), ws.claimToken),
              expires_at: ws.expiresAt,
              note: "Deliver the claim link to your human. It is single-use and expires in 24 hours; ROUT sends no e-mail.",
            },
            201,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          const failure = provisionFailure(message);
          if (failure === "agent_quota_reached") {
            return agentError(429, "rate_limited", "This member already has 3 unclaimed agent workspaces. Wait for a claim or the 24-hour expiry.");
          }
          if (failure === "slug_taken") {
            return agentError(400, "invalid_request", "That workspace slug is already taken. Choose another one.");
          }
          console.error("[agent:workspaces]", error);
          return agentError(500, "server_error", "The workspace could not be created right now.");
        }
      },
    },
  },
});
