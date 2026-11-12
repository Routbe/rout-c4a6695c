import { sql } from "@/lib/neon";
import { authenticateOAuthClient, OAuthError, issuer, sha256Base64Url, signJwt, verifyAccessToken, identityClaims } from "./provider.server";

export async function exchangeRefreshToken(input: { token: string; clientId: string; clientSecret: string | null; ip: string | null; requestedScope?: string | null }) {
  const client = await authenticateOAuthClient(input.clientId, input.clientSecret, input.ip);
  const next = crypto.randomUUID() + crypto.randomUUID();
  const rows = await sql`select * from public.rotate_oauth_refresh(${await sha256Base64Url(input.token)},${client.clientId},${await sha256Base64Url(next)})`;
  const row = rows[0];
  if (!row || row["result"] !== "ok") throw new OAuthError("invalid_grant", "Refresh token is ongeldig of hergebruikt.");
  const now = Math.floor(Date.now()/1000);
  // OIDC: a refresh request may narrow the scope set, never widen it or name
  // scopes outside the whitelist — anything else is invalid_scope (Cluster C).
  const { resolveRefreshScopes } = await import("./scope-rules");
  const requested = input.requestedScope?.split(" ").filter(Boolean) ?? null;
  const resolved = resolveRefreshScopes(requested, row["scopes"] as string[]);
  if (!resolved.ok) throw new OAuthError("invalid_scope", `Deze scope is niet toegekend: ${resolved.unknown}.`);
  const scopes = resolved.scopes;
  // Agent grants are ephemeral: at most one hour per access token.
  const { agentTokenTtl } = await import("@/lib/agent/agent-scopes");
  const ttl = agentTokenTtl(client.accessTokenTtl, scopes);
  // Re-derive the subject: rows from before the vault may hold a legacy value (even a raw id).
  const { resolveScopedSubject } = await import("./subject-vault.server");
  const subject = (await resolveScopedSubject(client, String(row["user_id"]))).sub;
  const token = await signJwt({ iss: issuer(), sub: subject, aud: client.clientId, iat: now, exp: now+ttl, scope: scopes.join(" "), token_use: "access", jti: crypto.randomUUID() });
  const claims = await identityClaims(String(row["user_id"]), scopes, { handleSync: client.handleSyncEnabled, clientId: client.clientId });
  const { HANDLE_RESERVATION_CLAIM, HANDLE_RESERVATION_SCOPE } = await import("./handle-reservation");
  if (scopes.includes(HANDLE_RESERVATION_SCOPE)) {
    const { handleReservationClaim } = await import("./handle-reservation.server");
    claims[HANDLE_RESERVATION_CLAIM] = await handleReservationClaim(String(row["user_id"]), client.clientId, subject);
  }
  const idToken = await signJwt({ iss: issuer(), sub: subject, aud: client.clientId, iat: now, exp: now+ttl, token_use: "id",
    ...(row["auth_time"] ? { auth_time: Math.floor(new Date(String(row["auth_time"])).getTime()/1000) } : {}), ...(row["acr"] ? { acr: row["acr"] } : {}), ...claims });
  // The family lock and status check are repeated when persisting the access token.
  const batch = await sql.transaction([
    sql`select pg_advisory_xact_lock(hashtextextended(${String(row["family_id"])},0))`,
    sql`insert into public.oauth_access_tokens(token_hash,client_id,user_id,subject,scopes,family_id,expires_at)
      select ${await sha256Base64Url(token)},${client.clientId},${row["user_id"]},${subject},${scopes},${row["family_id"]},${new Date((now+ttl)*1000).toISOString()}
      where not exists(select 1 from public.oauth_refresh_tokens r where r.family_id=${row["family_id"]} and r.revoked_at is not null)
      returning token_hash`,
  ]);
  if (!batch[1]?.length) throw new OAuthError("invalid_grant", "Refreshfamilie is ingetrokken.");
  return { access_token: token, id_token: idToken, refresh_token: next, token_type: "Bearer", expires_in: ttl, scope: scopes.join(" ") };
}

export async function revokeOAuthToken(token: string, clientId: string) {
  const hash = await sha256Base64Url(token);
  await sql.transaction([
    sql`update public.oauth_access_tokens set revoked_at=now() where token_hash=${hash} and client_id=${clientId}`,
    sql`update public.oauth_refresh_tokens set revoked_at=now() where client_id=${clientId}
      and family_id in(select family_id from public.oauth_refresh_tokens where token_hash=${hash} and client_id=${clientId})`,
    sql`update public.oauth_access_tokens set revoked_at=now() where client_id=${clientId}
      and family_id in(select family_id from public.oauth_refresh_tokens where token_hash=${hash} and client_id=${clientId})`,
  ]);
}

export async function introspectOAuthToken(token: string, clientId: string) {
  try {
    const verified = await verifyAccessToken(token);
    if (verified.clientId !== clientId) return { active: false };
    // Revoked, expired or consent-withdrawn tokens are never reported active.
    const rows = await sql`select t.expires_at,t.created_at,t.scopes,t.subject from public.oauth_access_tokens t
      join public.oauth_clients c on c.client_id=t.client_id join public.users u on u.id=t.user_id
      join public.oauth_consents g on g.client_id=t.client_id and g.user_id=t.user_id
      where t.token_hash=${await sha256Base64Url(token)} and t.client_id=${clientId} and t.revoked_at is null and t.expires_at>now()
        and c.status='active' and not u.is_disabled and u.account_status='active' and g.revoked_at is null
        and (t.family_id is null or not exists(select 1 from public.oauth_refresh_tokens f where f.family_id=t.family_id and f.revoked_at is not null)) limit 1`;
    const row = rows[0];
    if (!row) return { active: false };
    return { active: true, client_id: clientId, sub: verified.sub, scope: verified.scopes.join(" "), token_type: "Bearer", iss: issuer(),
      exp: Math.floor(new Date(String(row["expires_at"])).getTime()/1000), iat: Math.floor(new Date(String(row["created_at"])).getTime()/1000) };
  } catch {
    const rows = await sql`select r.user_id,r.scopes,r.expires_at from public.oauth_refresh_tokens r
      join public.oauth_clients c on c.client_id=r.client_id join public.users u on u.id=r.user_id
      join public.oauth_consents g on g.client_id=r.client_id and g.user_id=r.user_id
      where r.token_hash=${await sha256Base64Url(token)} and r.client_id=${clientId} and r.used_at is null and r.revoked_at is null
        and r.expires_at>now() and c.status='active' and not u.is_disabled and u.account_status='active' and g.revoked_at is null
        and not exists(select 1 from public.oauth_refresh_tokens f where f.family_id=r.family_id and f.revoked_at is not null) limit 1`;
    const row = rows[0];
    if (!row) return { active: false };
    const { scopedSubjectForClientId } = await import("./subject-vault.server");
    const sub = await scopedSubjectForClientId(String(row["user_id"]), clientId);
    return { active: true, client_id: clientId, sub, scope: (row["scopes"] as string[]).join(" "), token_type: "refresh_token", exp: Math.floor(new Date(String(row["expires_at"])).getTime()/1000) };
  }
}