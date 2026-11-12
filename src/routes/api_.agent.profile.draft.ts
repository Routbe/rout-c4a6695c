import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/agent/profile/draft — scope `profile:draft`.
 * The agent prepares a draft on one canvas (private alias or verified
 * profile). It is merged section by section like a Studio edit; publishing
 * live always stays a human action, so the answer is `human_action_required`
 * with a signed, temporary link to the Studio.
 */
const bodySchema = z.strictObject({
  space: z.enum(["alias", "verified"]),
  displayName: z.string().trim().max(120).nullable().optional(),
  tagline: z.string().trim().max(240).nullable().optional(),
  theme: z.string().trim().min(1).max(40).optional(),
  cardStyle: z.string().trim().min(1).max(40).optional(),
  blocks: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
});

export const Route = createFileRoute("/api_/agent/profile/draft")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateAgent, humanActionLink } = await import("@/lib/agent/agent-auth.server");
        const agent = await authenticateAgent(request, "profile:draft");
        if (agent instanceof Response) return agent;
        const { agentError, humanActionRequired } = await import("@/lib/agent/responses");
        const rawBody: unknown = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(rawBody);
        if (!parsed.success) return (await import("@/lib/agent/responses")).agentValidationError(parsed.error, rawBody);
        const { space, blocks, theme, cardStyle, ...meta } = parsed.data;
        const { parsePatch, profileMetaPatchSchema, profileThemePatchSchema, profileLinksPatchSchema } = await import("@/lib/profile-draft-patch");
        const checks = [
          parsePatch(profileMetaPatchSchema, { space, ...meta }),
          parsePatch(profileThemePatchSchema, { space, ...(theme ? { theme } : {}), ...(cardStyle ? { cardStyle } : {}) }),
          ...(blocks ? [parsePatch(profileLinksPatchSchema, { space, blocks })] : []),
        ];
        const invalid = checks.find((c) => "__invalid" in c) as { __invalid: string } | undefined;
        if (invalid) return agentError(400, "invalid_request", invalid.__invalid);

        try {
          const { withDbContext, sql } = await import("@/lib/neon");
          return await withDbContext({ userId: agent.userId, workspaceId: null }, async () => {
            if (space === "verified") {
              const rows = (await sql`select coalesce(verified, false) as v from public.profiles where id = ${agent.userId}`) as Record<string, unknown>[];
              if (rows[0]?.["v"] !== true) {
                const link = await humanActionLink(request, "/dashboard/identity");
                return humanActionRequired({
                  action: "verify_identity",
                  reason: "The verified profile unlocks after the member verifies their identity. Ask them to open this link.",
                  actionUrl: link.url,
                  expiresAt: link.expiresAt,
                });
              }
            }
            const fields: Record<string, unknown> = { ...meta };
            if (theme) fields["theme"] = theme;
            if (cardStyle) fields["cardStyle"] = cardStyle;
            if (blocks) fields["blocks"] = (checks[2] as { blocks: unknown[] }).blocks;
            // Chronos snapshot: the current values of every key the agent touches,
            // so the human can restore them with one click.
            const prevRows = (await sql`select payload from public.profile_drafts where user_id = ${agent.userId} and space = ${space}`) as { payload: Record<string, unknown> }[];
            const prevPayload = prevRows[0]?.payload ?? {};
            const previousFields: Record<string, unknown> = {};
            for (const key of Object.keys(fields)) previousFields[key] = prevPayload[key] ?? null;
            const { patchProfileDraft } = await import("@/lib/profile-drafts.server");
            let meta2;
            try {
              meta2 = await patchProfileDraft(agent.userId, space, { fields });
            } catch (error) {
              if (error instanceof Error && error.message.includes("draft_not_found")) {
                const link = await humanActionLink(request, "/studio");
                return humanActionRequired({
                  action: "sign_in",
                  reason: "This canvas has never been opened. Ask the member to open the Studio once, then retry.",
                  actionUrl: link.url,
                  expiresAt: link.expiresAt,
                });
              }
              throw error;
            }
            const { recordAgentMutation } = await import("@/lib/agent/chronos.server");
            await recordAgentMutation({
              workspaceId: null,
              userId: agent.userId,
              clientId: agent.clientId,
              action: "profile_draft.update",
              targetTable: "profile_drafts",
              targetId: space,
              previousState: { fields: previousFields },
              newState: { space, fields },
            });
            const link = await humanActionLink(request, "/studio");
            return humanActionRequired({
              action: "publish_profile",
              reason: "The draft is ready. Only the member can publish it live; ask them to review and publish.",
              actionUrl: link.url,
              expiresAt: link.expiresAt,
              result: { space, draft_revision: meta2.draftRevision, has_unpublished_changes: meta2.hasUnpublishedChanges },
            });
          });
        } catch (error) {
          console.error("[agent:profile-draft]", error);
          return agentError(500, "server_error", "The draft could not be saved right now.");
        }
      },
    },
  },
});
