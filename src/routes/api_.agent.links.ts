import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/agent/links — scope `assets:write`.
 * Creates a tracked QR code / short link for the member, through the same
 * quota check as the Studio (no free pass for agents): over the plan limit
 * the answer is HTTP 402 with an upgrade link, an hourly burst is 429.
 */
const bodySchema = z.strictObject({
  target_url: z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "only http(s) URLs"),
  label: z.string().trim().max(120).nullable().optional(),
  kind: z.enum(["qr", "link"]).optional(),
});

export const Route = createFileRoute("/api_/agent/links")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateAgent, humanActionLink, publicOrigin } = await import("@/lib/agent/agent-auth.server");
        const agent = await authenticateAgent(request, "assets:write");
        if (agent instanceof Response) return agent;
        const { agentError, agentOk, paymentRequired } = await import("@/lib/agent/responses");
        const rawBody: unknown = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(rawBody);
        if (!parsed.success) return (await import("@/lib/agent/responses")).agentValidationError(parsed.error, rawBody);
        const { shortLinkTargetBlocked } = await import("@/lib/short-link-target");
        if (shortLinkTargetBlocked(parsed.data.target_url)) return agentError(400, "invalid_request", "This target URL is not allowed.");
        try {
          const { withDbContext } = await import("@/lib/neon");
          return await withDbContext({ userId: agent.userId, workspaceId: null }, async () => {
            const { allocateSlugServer, createTrackedQr } = await import("@/lib/short-links.server");
            const slug = await allocateSlugServer();
            if (!slug) return agentError(500, "server_error", "No short code available right now; retry later.");
            try {
              const row = await createTrackedQr(agent.userId, {
                slug,
                targetType: "url",
                targetUrl: parsed.data.target_url,
                label: parsed.data.label ?? null,
                customDomain: null,
                kind: parsed.data.kind ?? "qr",
              });
              const { recordAgentMutation } = await import("@/lib/agent/chronos.server");
              await recordAgentMutation({
                workspaceId: null,
                userId: agent.userId,
                clientId: agent.clientId,
                action: "link.create",
                targetTable: "tracked_qrs",
                targetId: String(row["id"]),
                newState: { slug: row["slug"], target_url: row["target_url"], label: parsed.data.label ?? null },
              });
              return agentOk({ id: row["id"], short_url: `${publicOrigin(request)}/s/${row["slug"]}`, target_url: row["target_url"], created_by_client: agent.clientId }, 201);
            } catch (error) {
              const message = error instanceof Error ? error.message : "";
              if (message.includes("quota reached")) {
                const link = await humanActionLink(request, "/studio/account");
                return paymentRequired({
                  reason: "The member's plan allows no more short links. Verifying or upgrading the account raises the limit.",
                  upgradeUrl: link.url,
                  limit: "short_links.total",
                });
              }
              if (message.includes("last hour")) return agentError(429, "rate_limited", "Too many new links in the last hour for this member.");
              throw error;
            }
          });
        } catch (error) {
          console.error("[agent:links]", error);
          return agentError(500, "server_error", "The link could not be created right now.");
        }
      },
    },
  },
});
