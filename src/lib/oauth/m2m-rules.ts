import { AGENT_SCOPES } from "@/lib/agent/agent-scopes";
/** Pure rules for the OAuth client_credentials grant (machine-to-machine). */
export const M2M_TOKEN_TTL_SEC = 900;
/** Identity and agent scopes describe or act for a person; a machine token can never carry them. */
const USER_SCOPES = new Set(["openid", "profile", "email", "offline_access", "phone", "address", "linked_accounts", "accounts:merge", "sybil:verify", "profile:read", "identity:legal_name", "identity:national_id", "identity:handle_reservation", ...AGENT_SCOPES]);

/** Requested scopes that the client owns and that are not user scopes; null = invalid_scope. */
export function m2mScopes(requested: string | null, clientScopes: string[]): string[] | null {
  const allowed = clientScopes.filter((s) => !USER_SCOPES.has(s));
  if (!requested?.trim()) return allowed;
  const want = requested.split(/\s+/).filter(Boolean);
  if (want.some((s) => USER_SCOPES.has(s) || !allowed.includes(s))) return null;
  return [...new Set(want)];
}

export function m2mClaims(input: { issuer: string; clientId: string; scopes: string[]; nowSec: number; jti: string }) {
  return {
    iss: input.issuer,
    sub: `client:${input.clientId}`,
    aud: input.clientId,
    client_id: input.clientId,
    scope: input.scopes.join(" "),
    token_use: "m2m",
    iat: input.nowSec,
    exp: input.nowSec + M2M_TOKEN_TTL_SEC,
    jti: input.jti,
  };
}
