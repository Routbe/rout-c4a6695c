import { createFileRoute } from "@tanstack/react-router";

/**
 * Account-less entry for AI agents.
 * GET  /api/agent/sandbox → a signed proof-of-work challenge (10 min).
 * POST /api/agent/sandbox → { challenge, solution, agent_name } → a 24-hour
 *      sandbox key (`rsk_…`), shown once. Find `solution` such that
 *      sha256(challenge + ":" + solution) starts with `difficulty_bits` zero bits.
 */
export const Route = createFileRoute("/api_/agent/sandbox")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { agentError, agentOk } = await import("@/lib/agent/responses");
        const { guardShared } = await import("@/lib/rate-limit-db.server");
        const limited = await guardShared(request, "agent-sandbox-challenge", { limit: 20, windowSec: 3600 });
        if (limited) return limited;
        try {
          const { issueChallenge } = await import("@/lib/agent/agent-sandbox.server");
          return agentOk({ ...(await issueChallenge()), how: 'sha256(challenge + ":" + solution) must start with difficulty_bits zero bits; solution = 1–64 alphanumerics.' });
        } catch (error) {
          console.error("[agent:sandbox] challenge", (error as Error).message);
          return agentError(503, "server_error", "Agent sandboxes are not available right now.");
        }
      },
      POST: async ({ request }) => {
        const { agentError, agentOk } = await import("@/lib/agent/responses");
        const { guardShared, clientIp } = await import("@/lib/rate-limit-db.server");
        const limited = await guardShared(request, "agent-sandbox-register", { limit: 5, windowSec: 3600 });
        if (limited) return limited;
        const { sandboxRegisterInput } = await import("@/lib/agent/agent-sandbox");
        const rawBody: unknown = await request.json().catch(() => null);
        const parsed = sandboxRegisterInput.safeParse(rawBody);
        if (!parsed.success) return (await import("@/lib/agent/responses")).agentValidationError(parsed.error, rawBody);
        // Garbage collection without a scheduler: every registration first purges
        // expired, unclaimed agent workspaces and sandbox keys (24-hour TTL).
        try {
          const { purgeUnclaimedAgentWorkspaces } = await import("@/lib/agent/agent-workspaces.server");
          await purgeUnclaimedAgentWorkspaces();
        } catch (error) {
          console.error("[agent:sandbox] purge", (error as Error).message);
        }
        try {
          const { registerSandbox } = await import("@/lib/agent/agent-sandbox.server");
          const s = await registerSandbox({ challenge: parsed.data.challenge, solution: parsed.data.solution, agentName: parsed.data.agent_name, ip: clientIp(request) });
          return agentOk(
            {
              sandbox_key: s.sandboxKey,
              expires_at: s.expiresAt,
              next: "POST /api/agent/sandbox/workspace with Authorization: Bearer <sandbox_key>",
              note: "Store the key securely; it is shown once and only reaches the one workspace you create.",
            },
            201,
          );
        } catch (error) {
          const m = (error as Error).message ?? "";
          if (m.startsWith("challenge_")) return agentError(400, "invalid_request", `Proof-of-work rejected (${m.slice(10)}). Fetch a new challenge.`);
          if (m.includes("challenge_used")) return agentError(400, "invalid_request", "This challenge was already used. Fetch a new one.");
          if (m.includes("sandbox_quota_reached")) return agentError(429, "rate_limited", "Sandbox limit for this network reached (5 per 24 h).");
          console.error("[agent:sandbox] register failed");
          return agentError(500, "server_error", "The sandbox could not be created right now.");
        }
      },
    },
  },
});
