import { createFileRoute } from "@tanstack/react-router";

/**
 * GET|POST /api/v1/pow/challenge?scope=vault|workspace — a fresh, single-use,
 * HMAC-signed proof-of-work challenge (10 min). Replaces CAPTCHAs for agents.
 */
async function handle(request: Request): Promise<Response> {
  const { agentError, agentOk } = await import("@/lib/agent/responses");
  const { guardRequest } = await import("@/lib/api-guard.server");
  if (guardRequest(request, "pow-challenge", 60, 60_000)) return agentError(429, "rate_limited", "Too many challenge requests. Retry later.");
  const { isPowScope, POW_SCOPES } = await import("@/lib/pow/pow");
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  if (!isPowScope(scope)) return agentError(400, "invalid_request", `scope must be one of: ${POW_SCOPES.join(", ")}.`);
  try {
    const { issuePowChallenge } = await import("@/lib/pow/pow.server");
    const res = agentOk(await issuePowChallenge(scope));
    res.headers.set("cache-control", "no-store");
    return res;
  } catch {
    return agentError(503, "server_error", "Proof-of-work is not configured on this server.");
  }
}

export const Route = createFileRoute("/api_/v1/pow/challenge")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
