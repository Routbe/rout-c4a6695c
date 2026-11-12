import { agentError } from "./responses";
import type { AgentScope } from "./agent-scopes";

export type AgentContext = { userId: string; clientId: string; scopes: string[] };

/**
 * Zero-trust gate for every agent request: a Bearer OAuth access token,
 * verified on each call (ES256 signature, issuer, expiry, not revoked, app
 * active, consent still granted) and carrying the required agent scope.
 * Static API keys and machine tokens never pass: they cannot hold agent scopes.
 */
export async function authenticateAgent(request: Request, required: AgentScope): Promise<AgentContext | Response> {
  const { guardRequest } = await import("@/lib/api-guard.server");
  const limited = guardRequest(request, `agent:${required}`, 60, 60_000);
  if (limited) return agentError(429, "rate_limited", "Too many agent requests. Retry after the Retry-After interval.");

  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token) return agentError(401, "invalid_token", "Send a ROUT OAuth access token as `Authorization: Bearer <token>`.");

  const { verifyAccessToken, OAuthError } = await import("@/lib/oauth/provider.server");
  let verified: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    verified = await verifyAccessToken(token);
  } catch (error) {
    if (error instanceof OAuthError) {
      return agentError(401, "invalid_token", "The access token is invalid, expired or revoked. Run the OAuth flow again.");
    }
    console.error("[agent-auth]", error);
    return agentError(500, "server_error", "Token verification is temporarily unavailable.");
  }
  if (!verified.clientId || !verified.scopes.includes(required)) {
    return agentError(403, "insufficient_scope", `This token lacks the \`${required}\` scope.`, { required_scope: required });
  }
  return { userId: verified.userId, clientId: verified.clientId, scopes: verified.scopes };
}

/** Public origin for links handed back to agents. */
export function publicOrigin(request: Request): string {
  const configured = process.env["PUBLIC_ORIGIN"]?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") return url.origin;
    } catch {
      // fall through
    }
  }
  return new URL(request.url).origin;
}

/** Signed, 15-minute action link for a step only the human can take. */
export async function humanActionLink(request: Request, target: string): Promise<{ url: string; expiresAt: string }> {
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const secret = resolveAuthSecret()?.secret;
  if (!secret) throw new Error("action_ticket_secret_missing");
  const { signActionTicket } = await import("./action-ticket");
  const { ticket, expiresAt } = await signActionTicket(secret, target, Math.floor(Date.now() / 1000));
  return { url: `${publicOrigin(request)}/act?t=${encodeURIComponent(ticket)}`, expiresAt };
}
