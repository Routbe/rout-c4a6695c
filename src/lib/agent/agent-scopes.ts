/**
 * Agent scopes for the Agentic Web. Pure and browser-safe.
 *
 * Zero-trust rules:
 * - Agent scopes are delegated by a human on the consent screen and travel
 *   only in short-lived OAuth access tokens (at most AGENT_TOKEN_TTL_MAX_S).
 * - Static API keys and client_credentials (machine) tokens can never carry
 *   them: an agent always acts for a person who said yes.
 * - `identity:read_public` reads public verification status only — never
 *   identity relays, forwarding addresses or legal names.
 */
export const AGENT_SCOPES = ["assets:write", "profile:draft", "identity:read_public"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

/** Hard ceiling for an access token that carries any agent scope (1 hour). */
export const AGENT_TOKEN_TTL_MAX_S = 60 * 60;

export function isAgentScope(scope: string): scope is AgentScope {
  return (AGENT_SCOPES as readonly string[]).includes(scope);
}

/** Token lifetime for a grant: agent grants are capped at one hour. */
export function agentTokenTtl(clientTtl: number, scopes: readonly string[]): number {
  return scopes.some(isAgentScope) ? Math.min(clientTtl, AGENT_TOKEN_TTL_MAX_S) : clientTtl;
}

/** What an agent may do with each scope, for docs, manifests and consent copy. */
export const AGENT_SCOPE_DESCRIPTIONS: Record<AgentScope, string> = {
  "assets:write": "Create QR codes and short links in the member's account, within their plan limits.",
  "profile:draft": "Prepare profile drafts; publishing always stays a human action.",
  "identity:read_public": "Read public verification status (verified human yes/no). Never identity relays or legal names.",
};
