import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/agent/identity — scope `identity:read_public`.
 * Public verification status of the member who granted the token. Never
 * identity relays, forwarding addresses, e-mail or legal names.
 */
export const Route = createFileRoute("/api_/agent/identity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateAgent } = await import("@/lib/agent/agent-auth.server");
        const agent = await authenticateAgent(request, "identity:read_public");
        if (agent instanceof Response) return agent;
        const { agentOk, agentError } = await import("@/lib/agent/responses");
        try {
          const { withDbContext, sql } = await import("@/lib/neon");
          const rows = await withDbContext({ userId: agent.userId, workspaceId: null }, async () =>
            (await sql`
              select coalesce(p.verified, false) as verified_profile,
                     case when coalesce(p.verified, false) then p.username end as handle,
                     (select a.handle from public.alias_profiles a where a.user_id = p.id and a.enabled = true limit 1) as alias_handle,
                     coalesce(iv.is_verified, false) as identity_verified
                from public.profiles p
                left join public.identity_verifications iv on iv.user_id = p.id
               where p.id = ${agent.userId}
               limit 1
            `) as Record<string, unknown>[],
          );
          const row = rows[0];
          if (!row) return agentError(404, "not_found", "No ROUT profile for this token.");
          const verifiedHuman = row["verified_profile"] === true || row["identity_verified"] === true;
          return agentOk({
            verified_human: verifiedHuman,
            verified_profile: row["verified_profile"] === true ? { handle: row["handle"] ?? null } : null,
            alias: row["alias_handle"] ? { handle: row["alias_handle"] } : null,
          });
        } catch (error) {
          console.error("[agent:identity]", error);
          return agentError(500, "server_error", "Identity status is temporarily unavailable.");
        }
      },
    },
  },
});
