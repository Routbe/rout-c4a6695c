import { routHandleClaim } from "./handle-sync";
import { isValidRedirectUri, cleanRedirectUri, findMatchingRedirect, normalizeRedirectUri, redirectUrisMatch } from "./redirect-match";
/**
 * "Login met ROUT" — native OAuth 2.1 / OIDC provider.
 *
 * Alles wat geheim is blijft hier: clientsecrets worden uitsluitend gehasht
 * bewaard, autorisatiecodes zijn gehasht, eenmalig en kortlevend, PKCE S256 is
 * verplicht en redirect-URI's worden exact vergeleken. De ondertekensleutel is
 * asymmetrisch (ES256); alleen de publieke helft verlaat de server via JWKS.
 */
import { sql } from "@/lib/neon";
import { generateClientSecret, hashClientSecret, verifyClientSecret } from "./client-secret";
import { pairwiseSubject, redirectSector } from "./subject";
import { validAccessClaims } from "./token-policy";

/** Pepper for client-secret hashes: dedicated env var, else the auth secret. */
async function secretPepper(): Promise<string> {
  const own = process.env["OAUTH_CLIENT_SECRET_PEPPER"];
  if (own && own.length >= 32) return own;
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const resolved = resolveAuthSecret();
  if (!resolved) throw new OAuthError("server_error", "Geheimen kunnen niet veilig bewaard worden: auth-secret ontbreekt.");
  return resolved.secret;
}
import { canonicalAppUrl } from "@/lib/app-url";
import { SUPPORTED_SCOPES } from "./scope-rules";
import { HANDLE_RESERVATION_CLAIM, HANDLE_RESERVATION_SCOPE } from "./handle-reservation";
import { APP_ADMIN_ROLES, APP_EDITOR_ROLES, canManageClient, type ClientActor } from "./client-access";
export type { ClientActor };

// The whitelist lives in pure scope-rules.ts (Cluster C); re-exported here so
// existing imports keep working.
export { SUPPORTED_SCOPES };

/** Trusted KYC partners may request identity:national_id (set by ROUT admins only, db/0139). */
export async function isTrustedKycPartner(clientId: string): Promise<boolean> {
  const rows = (await sql`select is_trusted_kyc_partner from public.oauth_clients where client_id = ${clientId} limit 1`) as Row[];
  return rows[0]?.["is_trusted_kyc_partner"] === true;
}
export type Scope = (typeof SUPPORTED_SCOPES)[number];

const CODE_TTL_MS = 60 * 1000;
const ID_TOKEN_TTL_S = 60 * 60;

export type OAuthClient = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  homepageUrl: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  redirectUris: string[];
  scopes: string[];
  status: string;
  hasSecret: boolean;
  createdAt: string;
  /** `seamless` = direct doorgaan; `strict` = altijd een extra verificatiecode. */
  flowPreference: "seamless" | "strict";
  /** Mag de app (met toestemming van de gebruiker) publieke activiteit ontvangen? */
  richIdentityEnabled: boolean;
  /** Universal Handle Sync: share the @handle as `rout_handle`. */
  handleSyncEnabled: boolean;
  /** `testing` = enkel eigenaar + testgebruikers; `production` = iedereen. */
  publishingStatus: PublishingStatus;
  supportEmail: string | null;
  legalOwner: string | null;
  dpoEmail: string | null;
  /** PKCE S256 verplicht. Uitzetten kan enkel voor apps met een clientsecret. */
  requirePkce: boolean;
  /** Levensduur van access- en id-tokens in seconden. */
  accessTokenTtl: number;
  /** Lege lijst = alle IP's mogen het token-endpoint aanspreken. */
  allowedIps: string[];
  /** Stille herkenning via `prompt=none`. */
  accountDiscoveryEnabled: boolean;
  subjectType: "public" | "pairwise";
  sectorId: string | null;
  postLogoutRedirectUris: string[];
};

export type PublishingStatus = "testing" | "production";
export const MAX_TEST_USERS = 10;
export const TOKEN_TTL_MIN = 300;
export const TOKEN_TTL_MAX = 86400;

export class OAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "OAuthError";
  }
}

/* ------------------------------------------------------------------ utils */

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(bytes))));
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value) as BufferSource);
  return base64url(new Uint8Array(digest));
}

/** Genormaliseerde (maar strikte) vergelijking tegen de whitelist — zie redirect-match.ts. */
export function redirectAllowed(client: OAuthClient, redirectUri: string): boolean {
  return findMatchingRedirect(client.redirectUris, redirectUri) !== null;
}

/** Alleen https in productie; http uitsluitend voor localhost-ontwikkeling. */
export { isValidRedirectUri } from "./redirect-match";

export function issuer(): string {
  // Altijd absoluut (schema + host, zonder afsluitende /) zodat OIDC-clients zoals Keycloak geldige URL's bouwen.
  const raw = (process.env["NEXT_PUBLIC_APP_URL"] || canonicalAppUrl()).trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

type Row = Record<string, unknown>;

function toClient(row: Row): OAuthClient {
  return {
    id: String(row["id"]),
    clientId: String(row["client_id"]),
    name: String(row["name"]),
    description: (row["description"] as string | null) ?? null,
    logoUrl: (row["logo_url"] as string | null) ?? null,
    homepageUrl: (row["homepage_url"] as string | null) ?? null,
    privacyUrl: (row["privacy_url"] as string | null) ?? null,
    termsUrl: (row["terms_url"] as string | null) ?? null,
    redirectUris: (row["redirect_uris"] as string[] | null) ?? [],
    scopes: (row["scopes"] as string[] | null) ?? [],
    status: String(row["status"] ?? "active"),
    hasSecret: Boolean(row["secret_hash"]),
    createdAt: new Date(row["created_at"] as string).toISOString(),
    flowPreference: row["flow_preference"] === "strict" ? "strict" : "seamless",
    richIdentityEnabled: Boolean(row["rich_identity_enabled"]),
    handleSyncEnabled: Boolean(row["handle_sync_enabled"]),
    publishingStatus: row["publishing_status"] === "production" ? "production" : "testing",
    supportEmail: (row["support_email"] as string | null) ?? null,
    legalOwner: (row["legal_owner"] as string | null) ?? null,
    dpoEmail: (row["dpo_email"] as string | null) ?? null,
    requirePkce: row["require_pkce"] === undefined ? true : Boolean(row["require_pkce"]),
    accessTokenTtl: Number(row["access_token_ttl"] ?? ID_TOKEN_TTL_S) || ID_TOKEN_TTL_S,
    allowedIps: (row["allowed_ips"] as string[] | null) ?? [],
    accountDiscoveryEnabled: Boolean(row["account_discovery_enabled"]),
    subjectType: row["subject_type"] === "pairwise" ? "pairwise" : "public",
    sectorId: typeof row["sector_id"] === "string" ? row["sector_id"] : null,
    postLogoutRedirectUris: (row["post_logout_redirect_uris"] as string[] | null) ?? [],
  };
}

/* ----------------------------------------------------------------- client */

/** Personal scope (workspaceId null) lists the caller's personal apps; a workspace lists every app of that workspace (RLS limits it to members). */
export async function listClients(ownerUserId: string, workspaceId: string | null = null): Promise<OAuthClient[]> {
  const rows = (workspaceId
    ? await sql`select * from public.oauth_clients
        where workspace_id = ${workspaceId}::uuid order by created_at desc`
    : await sql`select * from public.oauth_clients
        where owner_user_id = ${ownerUserId} and workspace_id is null order by created_at desc`) as Row[];
  return rows.map(toClient);
}

export async function getClientByClientId(clientId: string): Promise<OAuthClient | null> {
  const rows = (await sql`select * from public.oauth_clients
    where client_id = ${clientId} limit 1`) as Row[];
  return rows[0] ? toClient(rows[0]) : null;
}

export type ClientInput = {
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  homepageUrl?: string | null;
  privacyUrl?: string | null;
  termsUrl?: string | null;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  scopes: string[];
  flowPreference?: "seamless" | "strict";
  richIdentityEnabled?: boolean;
  handleSyncEnabled?: boolean;
};

function cleanUriList(list: string[]): string[] {
  // Opschonen + dedupliceren op genormaliseerde vorm (spaties, onzichtbare tekens, geëncodeerde plak).
  const seen = new Set<string>();
  const uris = list
    .map((u) => cleanRedirectUri(u))
    .filter((u) => {
      const key = normalizeRedirectUri(u) ?? u;
      if (!u || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const bad = uris.find((u) => !isValidRedirectUri(u));
  if (bad) throw new OAuthError("invalid_redirect_uri", `Ongeldige redirect-URI: ${bad}`);
  return uris.map((uri) => normalizeRedirectUri(uri)!);
}

function sanitize(input: ClientInput) {
  const uris = cleanUriList(input.redirectUris);
  const logoutUris = input.postLogoutRedirectUris ? cleanUriList(input.postLogoutRedirectUris) : null;
  const scopes = [...new Set(input.scopes.filter((s) => SUPPORTED_SCOPES.includes(s as Scope)))];
  if (!scopes.includes("openid")) scopes.unshift("openid");
  const name = input.name.trim();
  if (!name) throw new OAuthError("invalid_name", "Geef je app een naam.");
  return { name, uris, logoutUris, scopes };
}

export async function createClient(
  ownerUserId: string,
  input: ClientInput,
  workspaceId: string | null = null,
): Promise<{ client: OAuthClient; clientSecret: string }> {
  const { name, uris, logoutUris, scopes } = sanitize(input);
  const sectors = new Set(uris.map(redirectSector));
  if (sectors.size !== 1) throw new OAuthError("invalid_client_metadata", "Pairwise apps vereisen één redirect-host.");
  const sectorId = uris[0] ? redirectSector(uris[0]) : null;
  const clientId = `rout_${randomToken(16)}`;
  const clientSecret = generateClientSecret();
  const secretHash = await hashClientSecret(clientSecret, await secretPepper());
  const rows = (await sql`insert into public.oauth_clients
    (owner_user_id, workspace_id, client_id, secret_hash, name, logo_url, homepage_url, privacy_url, terms_url, redirect_uris, post_logout_redirect_uris, scopes, subject_type, sector_id)
    values (${ownerUserId}, ${workspaceId}::uuid, ${clientId}, ${secretHash}, ${name}, ${input.logoUrl ?? null},
            ${input.homepageUrl ?? null}, ${input.privacyUrl ?? null}, ${input.termsUrl ?? null},
            ${uris}, ${logoutUris ?? []}, ${scopes}, 'pairwise', ${sectorId})
    returning *`) as Row[];
  const created = rows[0]!;
  if (input.description) {
    await sql`update public.oauth_clients set description = ${input.description.trim().slice(0, 500)}
      where id = ${created["id"] as string}`;
    created["description"] = input.description.trim().slice(0, 500);
  }
  if (input.flowPreference || input.richIdentityEnabled !== undefined) {
    const updated = (await sql`update public.oauth_clients set
        flow_preference = ${input.flowPreference === "strict" ? "strict" : "seamless"},
        rich_identity_enabled = ${Boolean(input.richIdentityEnabled)}
      where id = ${created["id"] as string} returning *`) as Row[];
    return { client: toClient(updated[0]!), clientSecret };
  }
  return { client: toClient(created), clientSecret };
}

export async function updateClient(
  actor: ClientActor,
  id: string,
  input: ClientInput,
): Promise<OAuthClient> {
  const { name, uris, logoutUris, scopes } = sanitize(input);
  const current = toClient(await manageableClientRow(actor, id));
  if (current?.subjectType === "pairwise" && uris.some((uri) => redirectSector(uri) !== current.sectorId)) {
    throw new OAuthError("invalid_client_metadata", "De pairwise redirect-host kan niet stilzwijgend wijzigen.");
  }
  const rows = (await sql`update public.oauth_clients set
      name = ${name}, logo_url = ${input.logoUrl ?? null},
      homepage_url = ${input.homepageUrl ?? null}, privacy_url = ${input.privacyUrl ?? null},
      terms_url = ${input.termsUrl ?? null},
      description = coalesce(${input.description ?? null}, description), redirect_uris = ${uris}, scopes = ${scopes},
      post_logout_redirect_uris = coalesce(${logoutUris}::text[], post_logout_redirect_uris),
      flow_preference = coalesce(${input.flowPreference ?? null}, flow_preference),
      rich_identity_enabled = coalesce(${input.richIdentityEnabled ?? null}::boolean, rich_identity_enabled),
      handle_sync_enabled = coalesce(${input.handleSyncEnabled ?? null}::boolean, handle_sync_enabled),
      updated_at = now()
    where id = ${id} returning *`) as Row[];
  if (!rows[0]) throw new OAuthError("not_found", "Deze app bestaat niet (meer).");
  return toClient(rows[0]);
}

/**
 * One-way opt-in for legacy clients: `public` → `pairwise` subjects. Existing
 * users of this app get a new, uncorrelatable `sub` after the switch — that is
 * exactly why only the app owner (or a workspace owner/admin) can request it and it can never be undone.
 * The sector is derived from the registered redirect host and locked in.
 */
export async function upgradeClientToPairwise(actor: ClientActor, id: string): Promise<OAuthClient> {
  const row = await manageableClientRow(actor, id, APP_ADMIN_ROLES);
  if (row["subject_type"] === "pairwise") return toClient(row);
  const uris = (row["redirect_uris"] as string[] | null) ?? [];
  if (!uris.length) throw new OAuthError("invalid_client_metadata", "Registreer eerst een redirect-adres.");
  const sectors = new Set(uris.map(redirectSector));
  if (sectors.size !== 1) throw new OAuthError("invalid_client_metadata", "Pairwise apps vereisen één redirect-host.");
  const sectorId = redirectSector(uris[0]!);
  const updated = (await sql`update public.oauth_clients
      set subject_type = 'pairwise', sector_id = ${sectorId}, updated_at = now()
      where id = ${id} and subject_type = 'public'
      returning *`) as Row[];
  if (!updated[0]) throw new OAuthError("invalid_client_metadata", "Deze app gebruikt al pairwise subjects.");
  return toClient(updated[0]);
}

/** Console-instellingen (db/50). Enkel meegegeven velden veranderen. */
export type ClientSettings = Partial<{
  publishingStatus: PublishingStatus;
  supportEmail: string | null;
  legalOwner: string | null;
  dpoEmail: string | null;
  requirePkce: boolean;
  accessTokenTtl: number;
  allowedIps: string[];
  accountDiscoveryEnabled: boolean;
}>;

export async function updateClientSettings(
  actor: ClientActor,
  id: string,
  s: ClientSettings,
): Promise<OAuthClient> {
  const c = toClient(await manageableClientRow(actor, id));
  const next = {
    publishingStatus: s.publishingStatus ?? c.publishingStatus,
    supportEmail: s.supportEmail !== undefined ? s.supportEmail : c.supportEmail,
    legalOwner: s.legalOwner !== undefined ? s.legalOwner : c.legalOwner,
    dpoEmail: s.dpoEmail !== undefined ? s.dpoEmail : c.dpoEmail,
    requirePkce: s.requirePkce ?? c.requirePkce,
    accessTokenTtl: s.accessTokenTtl ?? c.accessTokenTtl,
    allowedIps: s.allowedIps ?? c.allowedIps,
    accountDiscoveryEnabled: s.accountDiscoveryEnabled ?? c.accountDiscoveryEnabled,
  };
  if (!next.requirePkce && !c.hasSecret) {
    throw new OAuthError("invalid_settings", "PKCE uitzetten kan enkel voor apps met een clientsecret.");
  }
  if (next.publishingStatus === "production" && (!next.supportEmail || !next.legalOwner)) {
    throw new OAuthError("invalid_settings", "Vul eerst een support-e-mail en juridische eigenaar in.");
  }
  if (next.accessTokenTtl < TOKEN_TTL_MIN || next.accessTokenTtl > TOKEN_TTL_MAX) {
    throw new OAuthError("invalid_settings", "Tokenlevensduur moet tussen 5 minuten en 24 uur liggen.");
  }
  const rows = (await sql`update public.oauth_clients set
      publishing_status = ${next.publishingStatus}, support_email = ${next.supportEmail},
      legal_owner = ${next.legalOwner}, dpo_email = ${next.dpoEmail},
      require_pkce = ${next.requirePkce}, access_token_ttl = ${next.accessTokenTtl},
      allowed_ips = ${next.allowedIps}, account_discovery_enabled = ${next.accountDiscoveryEnabled},
      updated_at = now()
    where id = ${id} returning *`) as Row[];
  return toClient(rows[0]!);
}

/**
 * Loads an app the actor may manage: a personal app of the caller, or an app of
 * the active workspace when the caller holds one of `roles` there (client-access.ts).
 * Anything else reads as "not found" so app ids of other teams are not confirmed.
 */
async function manageableClientRow(
  actor: ClientActor,
  id: string,
  roles: readonly string[] = APP_EDITOR_ROLES,
): Promise<Row> {
  const rows = (await sql`select c.*, (select m.role::text from public.workspace_members m
      where m.workspace_id = c.workspace_id and m.user_id = ${actor.userId} limit 1) as actor_role
    from public.oauth_clients c where c.id = ${id} limit 1`) as Row[];
  const row = rows[0];
  const ownership = {
    ownerUserId: (row?.["owner_user_id"] as string | null | undefined) ?? null,
    workspaceId: (row?.["workspace_id"] as string | null | undefined) ?? null,
  };
  const role = (row?.["actor_role"] as string | null | undefined) ?? null;
  if (!row || !canManageClient(ownership, actor, role, roles)) {
    throw new OAuthError("not_found", "Deze app bestaat niet (meer).");
  }
  delete row["actor_role"];
  return row;
}

/** client_id of an app the actor may manage. */
export async function manageableClientId(actor: ClientActor, id: string): Promise<string> {
  return String((await manageableClientRow(actor, id))["client_id"]);
}
const ownedClientId = manageableClientId;

/* ------------------------------------------------------- test users ----- */

export async function listTestUsers(actor: ClientActor, id: string): Promise<string[]> {
  const clientId = await ownedClientId(actor, id);
  const rows = (await sql`select identifier from public.oauth_client_test_users
    where client_id = ${clientId} order by created_at`) as Row[];
  return rows.map((r) => String(r["identifier"]));
}

export async function addTestUser(actor: ClientActor, id: string, identifier: string) {
  const clientId = await ownedClientId(actor, id);
  const count = (await sql`select count(*)::int as n from public.oauth_client_test_users
    where client_id = ${clientId}`) as Row[];
  if (Number(count[0]?.["n"] ?? 0) >= MAX_TEST_USERS) {
    throw new OAuthError("limit", `Maximaal ${MAX_TEST_USERS} testgebruikers.`);
  }
  await sql`insert into public.oauth_client_test_users (client_id, identifier)
    values (${clientId}, ${identifier.toLowerCase()}) on conflict do nothing`;
}

export async function removeTestUser(actor: ClientActor, id: string, identifier: string) {
  const clientId = await ownedClientId(actor, id);
  await sql`delete from public.oauth_client_test_users
    where client_id = ${clientId} and identifier = ${identifier.toLowerCase()}`;
}

/** First-party platform clients (no owner, e.g. `rout_native_self`) are never in test mode. */
export const SYSTEM_CLIENT_IDS = new Set(["rout_native_self"]);

/** Testing-modus: enkel eigenaar en testgebruikers (e-mail of handle) mogen inloggen. */
export async function userMayUseClient(
  client: OAuthClient,
  user: { id: string; email: string },
): Promise<boolean> {
  if (client.publishingStatus === "production") return true;
  if (SYSTEM_CLIENT_IDS.has(client.clientId)) return true;
  const owner = (await sql`select c.owner_user_id, c.workspace_id,
      exists (select 1 from public.workspace_members m
        where m.workspace_id = c.workspace_id and m.user_id = ${user.id}
          and m.role::text = any(${[...APP_EDITOR_ROLES]})) as team_developer
    from public.oauth_clients c
    where c.client_id = ${client.clientId} limit 1`) as Row[];
  // Platform login (owner null) is ROUT's own sign-in, not a developer app.
  if (owner[0] && owner[0]["owner_user_id"] == null && owner[0]["workspace_id"] == null) return true;
  if (String(owner[0]?.["owner_user_id"]) === user.id) return true;
  // Teammates with developer rights may test a workspace app before it goes live.
  if (owner[0]?.["team_developer"] === true) return true;
  let handles: Row[] = [];
  try {
    handles = (await sql`select lower(username) as h from public.profiles
      where (user_id = ${user.id} or id = ${user.id}) and username is not null`) as Row[];
  } catch {
    handles = [];
  }
  const ids = [user.email.toLowerCase(), ...handles.map((r) => String(r["h"]))];
  const hit = (await sql`select 1 from public.oauth_client_test_users
    where client_id = ${client.clientId} and identifier = any(${ids}) limit 1`) as Row[];
  return hit.length > 0;
}

/* ----------------------------------------------------- verification ----- */

export type VerificationStatus = "none" | "pending" | "verified" | "rejected";

export async function latestVerification(actor: ClientActor, id: string) {
  const clientId = await ownedClientId(actor, id);
  const rows = (await sql`select status, created_at, reviewed_at
    from public.oauth_client_verification_requests
    where client_id = ${clientId} order by created_at desc limit 1`) as Row[];
  const r = rows[0];
  return {
    status: (r ? String(r["status"]) : "none") as VerificationStatus,
    requestedAt: r ? new Date(r["created_at"] as string).toISOString() : null,
    reviewedAt: r?.["reviewed_at"] ? new Date(r["reviewed_at"] as string).toISOString() : null,
  };
}

export async function requestVerification(actor: ClientActor, id: string, note: string) {
  const clientId = await ownedClientId(actor, id);
  const client = await getClientByClientId(clientId);
  if (!client?.supportEmail || !client.legalOwner || !client.privacyUrl) {
    throw new OAuthError("incomplete", "Vul eerst support-e-mail, juridische eigenaar en privacybeleid in.");
  }
  const open = (await sql`select 1 from public.oauth_client_verification_requests
    where client_id = ${clientId} and status in ('pending','verified') limit 1`) as Row[];
  if (open.length) throw new OAuthError("exists", "Er loopt al een aanvraag of de app is al geverifieerd.");
  await sql`insert into public.oauth_client_verification_requests (client_id, requested_by, note)
    values (${clientId}, ${actor.userId}, ${note || null})`;
}

/** Enkel aanroepen nadat de beheerdersrol server-side is gecontroleerd. */
export async function listPendingVerifications() {
  const rows = (await sql`select r.id, r.client_id, r.note, r.created_at, c.name, c.homepage_url,
      c.privacy_url, c.support_email, c.legal_owner
    from public.oauth_client_verification_requests r
    join public.oauth_clients c on c.client_id = r.client_id
    where r.status = 'pending' order by r.created_at`) as Row[];
  return rows.map((r) => ({
    id: String(r["id"]),
    clientId: String(r["client_id"]),
    name: String(r["name"]),
    note: (r["note"] as string | null) ?? null,
    homepageUrl: (r["homepage_url"] as string | null) ?? null,
    privacyUrl: (r["privacy_url"] as string | null) ?? null,
    supportEmail: (r["support_email"] as string | null) ?? null,
    legalOwner: (r["legal_owner"] as string | null) ?? null,
    createdAt: new Date(r["created_at"] as string).toISOString(),
  }));
}

export async function reviewVerification(reviewerId: string, requestId: string, approve: boolean) {
  await sql`update public.oauth_client_verification_requests
    set status = ${approve ? "verified" : "rejected"}, reviewed_by = ${reviewerId}, reviewed_at = now()
    where id = ${requestId} and status = 'pending'`;
}

export async function isVerifiedApp(clientId: string): Promise<boolean> {
  try {
    const rows = (await sql`select 1 from public.oauth_client_verification_requests
      where client_id = ${clientId} and status = 'verified' limit 1`) as Row[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------- insights ---- */

export async function clientInsights(actor: ClientActor, id: string) {
  const clientId = await ownedClientId(actor, id);
  const users = (await sql`select count(*)::int as n from public.oauth_consents
    where client_id = ${clientId}`) as Row[];
  const codes = (await sql`select
      count(*)::int as total,
      count(*) filter (where consumed_at is null and expires_at < now())::int as failed
    from public.oauth_auth_codes
    where client_id = ${clientId} and created_at > now() - interval '30 days'`) as Row[];
  const total = Number(codes[0]?.["total"] ?? 0);
  const failed = Number(codes[0]?.["failed"] ?? 0);
  return {
    activeUsers: Number(users[0]?.["n"] ?? 0),
    requests30d: total,
    errorRate: total ? Math.round((failed / total) * 1000) / 10 : 0,
  };
}

/** Exacte IP-match tegen de allowlist (leeg = alles toegestaan). */
export function ipAllowed(client: OAuthClient, ip: string | null): boolean {
  if (client.allowedIps.length === 0) return true;
  return Boolean(ip) && client.allowedIps.includes(ip!);
}

export async function deleteClient(actor: ClientActor, id: string): Promise<void> {
  await manageableClientRow(actor, id);
  await sql`delete from public.oauth_clients where id = ${id}`;
}

export async function rotateClientSecret(actor: ClientActor, id: string): Promise<string> {
  await manageableClientRow(actor, id);
  const clientSecret = generateClientSecret();
  const secretHash = await hashClientSecret(clientSecret, await secretPepper());
  const rows = (await sql`update public.oauth_clients
    set secret_hash = ${secretHash}, secret_rotated_at = now(), updated_at = now()
    where id = ${id} returning id`) as Row[];
  if (!rows[0]) throw new OAuthError("not_found", "Deze app bestaat niet (meer).");
  return clientSecret;
}

/* ------------------------------------------------------------------ codes */

export async function issueAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  nonce?: string | null;
  acr?: string | null;
  richIdentity?: boolean;
  /** Blind Hash Matching: sealed into the code itself, never stored in a column. */
  disclosure?: import("./blind-hash").BhmIdentity | null;
}): Promise<string> {
  let code = randomToken(32);
  if (input.disclosure) {
    const { sealCodeDisclosure } = await import("./code-disclosure.server");
    code = await sealCodeDisclosure(code, input.disclosure, process.env["BETTER_AUTH_SECRET"] ?? "");
  }
  const hash = await sha256Base64Url(code);
  const expires = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await sql`insert into public.oauth_auth_codes
    (code_hash, client_id, user_id, redirect_uri, scopes, code_challenge, nonce, expires_at, acr, rich_identity)
    values (${hash}, ${input.clientId}, ${input.userId}, ${input.redirectUri},
            ${input.scopes}, ${input.codeChallenge}, ${input.nonce ?? null}, ${expires},
            ${input.acr ?? null}, ${Boolean(input.richIdentity)})`;
  return code;
}

export async function rememberConsent(userId: string, clientId: string, scopes: string[]) {
  await sql`insert into public.oauth_consents (user_id, client_id, scopes)
    values (${userId}, ${clientId}, ${scopes})
    on conflict (user_id, client_id) do update set
      scopes = case when public.oauth_consents.revoked_at is null
        then array(select distinct x from unnest(public.oauth_consents.scopes || excluded.scopes) as x order by x)
        else excluded.scopes end,
      granted_at = now(), revoked_at = null`;
}

/**
 * Scopes this member already granted to the app (active consent only). Used for
 * incremental consent: a later "Verifieer met ROUT" request shows only what is new.
 */
export async function grantedScopesOf(userId: string, clientId: string): Promise<string[]> {
  const rows = (await sql`select scopes from public.oauth_consents
    where user_id = ${userId} and client_id = ${clientId} and revoked_at is null limit 1`) as Row[];
  return (rows[0]?.["scopes"] as string[] | null) ?? [];
}

async function consumeCode(code: string) {
  const hash = await sha256Base64Url(code);
  const rows = (await sql`update public.oauth_auth_codes set consumed_at = now()
    where code_hash = ${hash} and consumed_at is null and expires_at > now()
    returning *`) as Row[];
  if (!rows[0]) throw new OAuthError("invalid_grant", "Deze autorisatiecode is ongeldig of al gebruikt.");
  return rows[0];
}

/* ----------------------------------------------------------- signing keys */

export { publicJwks } from "./keys.server";

export async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const { activeKey } = await import("./keys.server");
  const key = await activeKey();
  const header = { alg: "ES256", typ: "JWT", kid: key.kid };
  const body = `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(enc.encode(JSON.stringify(payload)))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, enc.encode(body) as BufferSource),
  );
  return `${body}.${base64url(signature)}`;
}

/* ------------------------------------------------------------ token grant */

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  codeVerifier: string | null;
  clientIp?: string | null;
}) {
  const client = await getClientByClientId(input.clientId);
  if (!client || client.status !== "active") {
    throw new OAuthError("invalid_client", "Onbekende app.");
  }
  if (!ipAllowed(client, input.clientIp ?? null)) {
    throw new OAuthError("invalid_client", "Dit IP-adres mag geen tokens ophalen voor deze app.");
  }
  const stored = (await sql`select secret_hash from public.oauth_clients
    where client_id = ${input.clientId} limit 1`) as Row[];
  const secretHash = (stored[0]?.["secret_hash"] as string | null) ?? null;
  let secretVerified = false;
  if (secretHash) {
    const ok = input.clientSecret
      ? await verifyClientSecret(input.clientSecret, secretHash, await secretPepper())
      : false;
    if (!ok) throw new OAuthError("invalid_client", "Clientsecret klopt niet.");
    secretVerified = true;
  }

  const row = await consumeCode(input.code);
  if (String(row["client_id"]) !== input.clientId) {
    throw new OAuthError("invalid_grant", "Deze code hoort bij een andere app.");
  }
  if (!redirectUrisMatch(String(row["redirect_uri"]), input.redirectUri)) {
    console.error(
      `[OIDC Token] redirect_uri mismatch for client ${input.clientId}. Authorize used: ${JSON.stringify(String(row["redirect_uri"]))} | Token request: ${JSON.stringify(input.redirectUri)}`,
    );
    throw new OAuthError("invalid_grant", "De redirect-URI komt niet overeen.");
  }
  const storedChallenge = String(row["code_challenge"] ?? "");
  if (storedChallenge) {
    // Code werd met PKCE uitgegeven: de verifier is altijd verplicht.
    if (!input.codeVerifier) throw new OAuthError("invalid_grant", "code_verifier ontbreekt.");
    if ((await sha256Base64Url(input.codeVerifier)) !== storedChallenge) {
      throw new OAuthError("invalid_grant", "PKCE-controle mislukt.");
    }
  } else if (client.requirePkce || !secretVerified) {
    // Zonder PKCE enkel voor vertrouwelijke apps die PKCE expliciet uitzetten.
    throw new OAuthError("invalid_grant", "PKCE is verplicht voor deze app.");
  }
  const userId = String(row["user_id"]);
  const scopes = (row["scopes"] as string[] | null) ?? [];
  // Agent grants are ephemeral: at most one hour, whatever the client asks for.
  const { agentTokenTtl } = await import("@/lib/agent/agent-scopes");
  const ttl = agentTokenTtl(Math.min(Math.max(client.accessTokenTtl, TOKEN_TTL_MIN), TOKEN_TTL_MAX), scopes);
  const claims = await identityClaims(userId, scopes, { handleSync: client.handleSyncEnabled, clientId: client.clientId });
  // Blind Hash Matching: the one identity the member confirmed, id_token only
  // (never in userinfo, introspection or refresh), and only with the scope.
  const idOnlyClaims: Record<string, unknown> = {};
  if (scopes.includes("accounts:merge")) {
    const { openCodeDisclosure } = await import("./code-disclosure.server");
    const matched = await openCodeDisclosure(input.code, process.env["BETTER_AUTH_SECRET"] ?? "");
    if (matched) idOnlyClaims["rout_matched_account"] = { kind: matched.kind, value: matched.value };
  }
  // Rich Identity: enkel als de app het aanzette én de gebruiker het aanvinkte.
  if (row["rich_identity"] && client.richIdentityEnabled) {
    try {
      const { readPublicTimeline } = await import("@/lib/public-timeline.server");
      claims["rout_public_activity"] = (await readPublicTimeline(userId)).map((i) => ({
        kind: i.kind,
        title: i.title,
        occurred_at: i.occurred_at,
      }));
    } catch {
      claims["rout_public_activity"] = [];
    }
  }
  const now = Math.floor(Date.now() / 1000);
  const scoped = await subjectFor(client, userId, String(row["redirect_uri"]));
  const subject = scoped.sub;
  if (scopes.includes(HANDLE_RESERVATION_SCOPE)) {
    const { handleReservationClaim } = await import("./handle-reservation.server");
    claims[HANDLE_RESERVATION_CLAIM] = await handleReservationClaim(userId, client.clientId, subject);
  }
  const idToken = await signJwt({
    iss: issuer(),
    sub: subject,
    // Key rotation: the app's previous subject for this member, so it can re-link once.
    ...(scoped.previousSub ? { previous_sub: scoped.previousSub } : {}),
    aud: input.clientId,
    iat: now,
    exp: now + ttl,
    token_use: "id",
    ...(row["auth_time"] ? { auth_time: Math.floor(new Date(String(row["auth_time"])).getTime() / 1000) } : {}),
    ...(row["nonce"] ? { nonce: String(row["nonce"]) } : {}),
    ...(row["acr"] ? { acr: String(row["acr"]) } : {}),
    ...claims,
    ...idOnlyClaims,
  });
  const accessToken = await signJwt({
    iss: issuer(),
    sub: subject,
    aud: input.clientId,
    scope: scopes.join(" "),
    iat: now,
    exp: now + ttl,
    token_use: "access",
    jti: randomToken(16),
    ...(row["acr"] ? { acr: String(row["acr"]) } : {}),
  });
  let refreshToken: string | undefined;
  let familyId: string | null = null;
  if (scopes.includes("offline_access") && await hasConsent(userId, client.clientId, ["offline_access"])) {
    refreshToken = randomToken(48);
    familyId = crypto.randomUUID();
    await sql`insert into public.oauth_refresh_tokens(family_id,token_hash,client_id,user_id,scopes,expires_at,subject,auth_time,acr)
      values(${familyId},${await sha256Base64Url(refreshToken)},${client.clientId},${userId},${scopes},now()+interval '30 days',${subject},${row["auth_time"] ?? null},${row["acr"] ?? null})`;
  }
  await sql`insert into public.oauth_access_tokens(token_hash,client_id,user_id,subject,scopes,family_id,expires_at)
    values(${await sha256Base64Url(accessToken)},${client.clientId},${userId},${subject},${scopes},${familyId},${new Date((now+ttl)*1000).toISOString()})`;
  const { appendEncryptedUserEvent } = await import("@/lib/ledger/ledger.server");
  await appendEncryptedUserEvent(userId, { event_type: "app_login", app_name: client.name, scopes, timestamp: new Date().toISOString() });
  return {
    access_token: accessToken,
    id_token: idToken,
    token_type: "Bearer",
    expires_in: ttl,
    scope: scopes.join(" "),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  };
}

/** Claims volgens de toegestane scopes; `sub` komt altijd uit de subject-vault, nooit het interne id. */
export async function identityClaims(
  userId: string,
  scopes: string[],
  opts: { handleSync?: boolean; clientId?: string | null } = {},
): Promise<Record<string, unknown>> {
  const rows = (await sql`select u.email, u.email_confirmed_at, p.username, p.display_name, p.avatar_url
    from public.users u left join public.profiles p on p.user_id = u.id
    where u.id = ${userId} limit 1`) as Row[];
  const row = rows[0];
  if (!row) return {};
  const claims: Record<string, unknown> = {};
  if (scopes.includes("profile")) {
    claims["preferred_username"] = row["username"] ?? null;
    claims["name"] = row["display_name"] ?? null;
    // Per-app proxy URL: differs for every app, never carries the account id, dies with the consent.
    const { appPictureUrl } = await import("./picture-proxy.server");
    claims["picture"] = await appPictureUrl(row["avatar_url"], userId, opts.clientId ?? null, issuer());
  }
  const handle = routHandleClaim(Boolean(opts.handleSync), scopes, row["username"]);
  if (handle !== undefined) claims["rout_handle"] = handle;
  if (scopes.includes("email")) {
    claims["email"] = row["email"] ?? null;
    claims["email_verified"] = Boolean(row["email_confirmed_at"]);
    if (opts.clientId) {
      // Per-app choice; an unavailable private choice must omit the email claim.
      try {
        const { appEmailFor } = await import("./email-broker.server");
        const chosen = await appEmailFor(userId, opts.clientId);
        if (chosen) {
          claims["email"] = chosen.email;
          claims["email_verified"] = chosen.verified;
        } else {
          delete claims["email"];
          delete claims["email_verified"];
        }
      } catch (e) {
        // Fail closed: the app may have chosen the relay, so never fall back to the real address.
        console.warn("[oauth] app email lookup failed", (e as Error)?.message);
        delete claims["email"];
        delete claims["email_verified"];
      }
    }
  }
  // `linked_accounts` is retired: a list of a member's other sign-ins is a
  // cross-app correlation risk. The scope is still accepted so existing apps
  // keep working, but the claim is never emitted (blind account matching only).
  return claims;
}

/** Social sign-ins on this member: Better Auth accounts + fediverse identities. Never tokens. */
export async function linkedAccountsOf(
  userId: string,
): Promise<Array<{ provider: string; account_id: string }>> {
  const out: Array<{ provider: string; account_id: string }> = [];
  const seen = new Set<string>();
  const add = (provider: unknown, id: unknown) => {
    const p = String(provider ?? "").toLowerCase();
    const a = String(id ?? "");
    if (!p || !a || p === "credential" || p === "email") return;
    const key = `${p}:${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ provider: p, account_id: a });
  };
  try {
    const ba = (await sql`select a."providerId" as p, a."accountId" as a
      from public.users u join neon_auth.account a on a."userId"::text = u.user_metadata->>'neon_auth_id'
      where u.id = ${userId} order by a."createdAt"`) as Row[];
    ba.forEach((r) => add(r["p"], r["a"]));
  } catch (e) {
    console.warn("[oauth] linked accounts (auth) skipped:", (e as Error).message);
  }
  try {
    const fedi = (await sql`select provider, provider_account_id from public.user_identities
      where user_id = ${userId} order by provider, created_at`) as Row[];
    fedi.forEach((r) => add(r["provider"], r["provider_account_id"]));
  } catch {
    /* optional table */
  }
  return out;
}

/**
 * The member's own matchable identities for Blind Hash Matching: confirmed
 * primary email, active email aliases and linked sign-in provider ids. Only
 * ever returned to the member themself, never to an app.
 */
export async function matchableIdentitiesOf(userId: string): Promise<import("./blind-hash").BhmIdentity[]> {
  const { bhmKindForProvider, normalizeIdentityValue } = await import("./blind-hash");
  const out: import("./blind-hash").BhmIdentity[] = [];
  const add = (i: import("./blind-hash").BhmIdentity) => {
    const v = normalizeIdentityValue(i.kind, i.value);
    if (v && !out.some((o) => o.kind === i.kind && o.value === v)) out.push({ kind: i.kind, value: v });
  };
  const u = ((await sql`select email, email_confirmed_at from public.users where id = ${userId} limit 1`) as Row[])[0];
  if (u?.["email"] && u["email_confirmed_at"]) add({ kind: "email", value: String(u["email"]) });
  try {
    const aliases = (await sql`select alias from public.email_aliases where user_id = ${userId} and status = 'active'`) as Row[];
    aliases.forEach((a) => a["alias"] && add({ kind: "email", value: String(a["alias"]) }));
  } catch { /* optional table */ }
  for (const a of await linkedAccountsOf(userId)) {
    const kind = bhmKindForProvider(a.provider);
    if (kind) add({ kind, value: a.account_id });
  }
  return out.slice(0, 50);
}

/* ----------------------------------------------------- toegang & userinfo */

/** De console staat alleen open voor geverifieerde (betalende) leden. */
export async function isVerifiedDeveloper(userId: string): Promise<boolean> {
  const { canUseDeveloperConsole } = await import("./console-access-rules");
  // Each signal is read separately so a missing optional column/table never
  // turns into a false "not verified".
  const safe = async (q: () => Promise<unknown>): Promise<Row[]> => {
    try {
      return (await q()) as Row[];
    } catch (error) {
      console.warn("[console-access] signal skipped:", (error as Error).message);
      return [];
    }
  };
  const [profile] = await safe(() =>
    sql`select to_jsonb(p) as p from public.profiles p where p.id = ${userId} limit 1`,
  );
  const p = (profile?.["p"] ?? {}) as Record<string, unknown>;
  const admin = await safe(() =>
    sql`select 1 from public.user_roles where user_id = ${userId} and role::text = 'admin' limit 1`,
  );
  const handle = await safe(() =>
    sql`select 1 from public.approved_handles where user_id = ${userId} and status = 'claimed' limit 1`,
  );
  return canUseDeveloperConsole({
    verified: p["verified"] === true,
    isPaid: p["is_paid"] === true,
    isEarlyBeliever: p["is_early_believer"] === true,
    isBanned: p["is_banned"] === true,
    isSuspended: p["is_suspended"] === true,
    hasClaimedRootHandle: handle.length > 0,
    isAdmin: admin.length > 0,
  });
}

/** Verifieert een door ROUT uitgegeven access-token en geeft sub + scopes terug. */
export async function verifyAccessToken(
  token: string,
): Promise<{ sub: string; userId: string; scopes: string[]; clientId: string | null; acr: string | null }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new OAuthError("invalid_token", "Ongeldig token.");
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const fromB64 = (value: string) =>
    Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  let header: { alg?: unknown; kid?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64(headerPart))) as { alg?: unknown; kid?: unknown };
  } catch {
    throw new OAuthError("invalid_token", "Ongeldig token.");
  }
  // Alleen ES256 en alleen een exact bekende `kid`; nooit terugvallen op een andere sleutel.
  const { verificationKey } = await import("./keys.server");
  const key = await verificationKey(header);
  if (!key) throw new OAuthError("invalid_token", "Onbekende ondertekensleutel.");
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      fromB64(signaturePart) as BufferSource,
      enc.encode(`${headerPart}.${payloadPart}`) as BufferSource,
    );
  } catch {
    ok = false;
  }
  if (!ok) throw new OAuthError("invalid_token", "Handtekening klopt niet.");
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64(payloadPart))) as Record<string, unknown>;
  } catch {
    throw new OAuthError("invalid_token", "Ongeldig token.");
  }
  if (!validAccessClaims(payload, issuer(), Math.floor(Date.now()/1000))) throw new OAuthError("invalid_token", "Ongeldige access-tokenclaims.");
  const rows = await sql`select t.user_id from public.oauth_access_tokens t
    join public.oauth_clients c on c.client_id=t.client_id
    join public.users u on u.id=t.user_id
    join public.oauth_consents g on g.user_id=t.user_id and g.client_id=t.client_id
    where t.token_hash=${await sha256Base64Url(token)} and t.revoked_at is null and t.expires_at>now()
      and t.subject=${payload["sub"]} and t.client_id=${payload["aud"]}
      and c.status='active' and not u.is_disabled and u.account_status='active' and g.revoked_at is null
      and (t.family_id is null or not exists(select 1 from public.oauth_refresh_tokens r where r.family_id=t.family_id and r.revoked_at is not null))
    limit 1`;
  const userId = rows[0]?.["user_id"];
  if (typeof userId !== "string") throw new OAuthError("invalid_token", "Token is ingetrokken.");
  return {
    sub: String(payload["sub"]), userId,
    scopes: String(payload["scope"]).split(" ").filter(Boolean),
    clientId: String(payload["aud"]),
    acr: typeof payload["acr"] === "string" ? payload["acr"] : null,
  };
}

/** Bestaande toestemming voor deze app, als die alle gevraagde scopes dekt. */
export async function hasConsent(
  userId: string,
  clientId: string,
  scopes: string[],
): Promise<boolean> {
  const rows = (await sql`select scopes from public.oauth_consents
    where user_id = ${userId} and client_id = ${clientId} and revoked_at is null limit 1`) as Row[];
  const granted = (rows[0]?.["scopes"] as string[] | null) ?? null;
  if (!granted) return false;
  return scopes.every((s) => granted.includes(s));
}

/* -------------------------------------------------------------- step-up */

async function otpKey(): Promise<CryptoKey> {
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const s = resolveAuthSecret();
  if (!s?.secret) throw new Error("step_up_secret_missing");
  const { deriveOtpKey } = await import("./step-up-binding");
  return deriveOtpKey(s.secret);
}

/** New e-mail OTP for one authorization request; older open codes for it are closed. */
export async function createStepUpCode(userId: string, clientId: string, requestId: string): Promise<string> {
  const { otpHash, STEP_UP_TTL_SEC } = await import("./step-up-binding");
  const digits = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  const code = String(digits).padStart(6, "0");
  const hash = await otpHash(await otpKey(), userId, clientId, requestId, code);
  await sql.transaction([
    sql`update public.oauth_step_up_codes set consumed_at = now()
      where user_id = ${userId} and client_id = ${clientId} and consumed_at is null and verified_at is null`,
    sql`insert into public.oauth_step_up_codes (user_id, client_id, request_id, method, code_hash, expires_at)
      values (${userId}, ${clientId}, ${requestId}, 'email', ${hash}, now() + make_interval(secs => ${STEP_UP_TTL_SEC}))`,
  ]);
  return code;
}

/**
 * Checks the code in ONE conditional UPDATE (attempts < limit, not verified,
 * not expired): parallel guesses cannot exceed the attempt limit.
 */
export async function verifyStepUpCode(userId: string, clientId: string, requestId: string, code: string) {
  const { otpHash, classifyVerify } = await import("./step-up-binding");
  const { STEP_UP_MAX_ATTEMPTS } = await import("./step-up");
  const hash = await otpHash(await otpKey(), userId, clientId, requestId, code);
  const rows = (await sql`
    with c as (
      select id, attempts, expires_at from public.oauth_step_up_codes
       where user_id = ${userId} and client_id = ${clientId} and request_id = ${requestId}
         and method = 'email' and consumed_at is null and verified_at is null
       order by created_at desc limit 1),
    u as (
      update public.oauth_step_up_codes t
         set verified_at = case when t.code_hash = ${hash} then now() else null end,
             attempts = t.attempts + case when t.code_hash = ${hash} then 0 else 1 end
        from c
       where t.id = c.id and t.attempts < ${STEP_UP_MAX_ATTEMPTS} and t.expires_at > now() and t.verified_at is null
      returning (t.verified_at is not null) as ok)
    select (select ok from u) as ok, (select count(*) from u)::int as updated,
           (select attempts from c) as attempts, (select expires_at from c) as expires_at`) as Row[];
  const r = rows[0] ?? {};
  return classifyVerify(
    Number(r["updated"] ?? 0) > 0 ? { ok: Boolean(r["ok"]) } : null,
    r["expires_at"] ? { attempts: Number(r["attempts"] ?? 0), expiresAt: new Date(String(r["expires_at"])).toISOString() } : null,
    Date.now(),
  );
}

/** Consumes the verified proof of exactly this request + client, once, within 5 minutes. */
export async function consumeVerifiedStepUp(userId: string, clientId: string, requestId: string): Promise<boolean> {
  const { STEP_UP_TTL_SEC } = await import("./step-up-binding");
  const rows = (await sql`update public.oauth_step_up_codes set consumed_at = now()
    where id = (select id from public.oauth_step_up_codes
                 where user_id = ${userId} and client_id = ${clientId} and request_id = ${requestId}
                   and verified_at is not null and consumed_at is null
                   and verified_at > now() - make_interval(secs => ${STEP_UP_TTL_SEC})
                 order by verified_at desc limit 1)
    and consumed_at is null
    returning id`) as Row[];
  return rows.length > 0;
}

/* ------------------------------------------------- passkey step-up (WebAuthn) */

function passkeyRp(): { rpID: string; origin: string } {
  const origin = new URL(canonicalAppUrl()).origin;
  return { rpID: new URL(origin).hostname, origin };
}

async function betterAuthUserId(userId: string): Promise<string | null> {
  const rows = (await sql`select coalesce(auth_user_id::text, user_metadata->>'neon_auth_id') as ba
    from public.users where id = ${userId} limit 1`) as Row[];
  return (rows[0]?.["ba"] as string | null) ?? null;
}

/** Single-use challenge for this authorization request; returns WebAuthn request options. */
export async function startPasskeyStepUp(userId: string, clientId: string, requestId: string) {
  const ba = await betterAuthUserId(userId);
  if (!ba) return null;
  const keys = (await sql`select "credentialID" as id, transports from neon_auth.passkey where "userId" = ${ba}`) as Row[];
  if (!keys.length) return null;
  const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
  const { STEP_UP_TTL_SEC } = await import("./step-up-binding");
  const { rpID } = passkeyRp();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    timeout: STEP_UP_TTL_SEC * 1000,
    allowCredentials: keys.map((k) => ({
      id: String(k["id"]),
      transports: k["transports"] ? (String(k["transports"]).split(",") as never) : undefined,
    })),
  });
  await sql.transaction([
    sql`update public.oauth_step_up_challenges set consumed_at = now()
      where user_id = ${userId} and client_id = ${clientId} and consumed_at is null`,
    sql`insert into public.oauth_step_up_challenges (user_id, client_id, request_id, challenge, expires_at)
      values (${userId}, ${clientId}, ${requestId}, ${options.challenge}, now() + make_interval(secs => ${STEP_UP_TTL_SEC}))`,
  ]);
  return options;
}

export type PasskeyStepUpResult = "ok" | "expired" | "origin" | "challenge" | "unknown_key" | "invalid" | "counter";

/**
 * Verifies a WebAuthn assertion for this request: challenge (single use, bound
 * to user + client + request), origin, RP ID, user presence + verification,
 * signature and counter. Success records a verified, request-bound proof.
 */
export async function finishPasskeyStepUp(
  userId: string,
  clientId: string,
  requestId: string,
  response: { id: string; rawId: string; type: string; response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string }; clientExtensionResults?: Record<string, unknown> },
): Promise<PasskeyStepUpResult> {
  const { checkClientData, counterAccepted } = await import("./step-up-binding");
  // Claim the challenge first, atomically: a replay finds nothing to claim.
  const claimed = (await sql`update public.oauth_step_up_challenges set consumed_at = now()
    where id = (select id from public.oauth_step_up_challenges
                 where user_id = ${userId} and client_id = ${clientId} and request_id = ${requestId}
                   and consumed_at is null and expires_at > now()
                 order by created_at desc limit 1)
      and consumed_at is null
    returning challenge`) as Row[];
  const challenge = claimed[0]?.["challenge"] as string | undefined;
  if (!challenge) return "expired";
  const { rpID, origin } = passkeyRp();
  const pre = checkClientData(response.response.clientDataJSON, { challenge, origin });
  if (!pre.ok) return pre.reason === "origin" ? "origin" : "challenge";
  const ba = await betterAuthUserId(userId);
  const keys = ba
    ? ((await sql`select id, "publicKey" as pk, counter, transports from neon_auth.passkey
        where "userId" = ${ba} and "credentialID" = ${response.id} limit 1`) as Row[])
    : [];
  const key = keys[0];
  if (!key) return "unknown_key";
  const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: response as never,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: response.id,
        publicKey: Uint8Array.from(atob(String(key["pk"])), (c) => c.charCodeAt(0)),
        counter: Number(key["counter"] ?? 0),
      },
    });
  } catch (error) {
    console.warn("[oauth] passkey step-up rejected", (error as Error)?.message);
    return "invalid";
  }
  if (!verification.verified) return "invalid";
  const next = verification.authenticationInfo.newCounter;
  if (!counterAccepted(Number(key["counter"] ?? 0), next)) return "counter";
  const { STEP_UP_TTL_SEC } = await import("./step-up-binding");
  await sql.transaction([
    sql`update neon_auth.passkey set counter = ${next} where id = ${key["id"] as string}`,
    sql`insert into public.oauth_step_up_codes (user_id, client_id, request_id, method, code_hash, expires_at, verified_at)
      values (${userId}, ${clientId}, ${requestId}, 'passkey', 'passkey', now() + make_interval(secs => ${STEP_UP_TTL_SEC}), now())`,
  ]);
  return "ok";
}

/** Scoped subject for a token. Never the internal account id (see subject-vault.server.ts). */
export async function subjectFor(client: OAuthClient, userId: string, redirectUri: string): Promise<{ sub: string; previousSub: string | null }> {
  if (client.subjectType === "pairwise") {
    const sector = redirectSector(redirectUri);
    if (!client.sectorId || client.sectorId !== sector) throw new OAuthError("invalid_client", "Pairwise sector klopt niet.");
  }
  const { resolveScopedSubject } = await import("./subject-vault.server");
  try {
    return await resolveScopedSubject(client, userId);
  } catch (error) {
    console.error("[oauth] scoped subject failed", (error as Error)?.message);
    throw new OAuthError("server_error", "Subject kon niet worden afgeleid.");
  }
}

export async function authenticateOAuthClient(clientId: string, clientSecret: string | null, ip: string | null, confidential = false) {
  const client = await getClientByClientId(clientId);
  if (!client || client.status !== "active" || !ipAllowed(client, ip)) throw new OAuthError("invalid_client", "Ongeldige client.");
  const rows = await sql`select secret_hash from public.oauth_clients where client_id=${clientId} limit 1`;
  const hash = rows[0]?.["secret_hash"];
  if (confidential && typeof hash !== "string") throw new OAuthError("invalid_client", "Vertrouwelijke client vereist.");
  if (typeof hash === "string" && (!clientSecret || !(await verifyClientSecret(clientSecret, hash, await secretPepper())))) throw new OAuthError("invalid_client", "Ongeldige client.");
  return client;
}
