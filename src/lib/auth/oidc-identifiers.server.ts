/**
 * Identifier layers for "Login met ROUT": the internal user id never leaves the
 * server; apps get a pairwise subject and, with `sybil:verify`, a per-app nullifier.
 */
import { sql } from "@/lib/neon";
import { appSybilNullifier } from "./oidc-identifiers";
import { HANDLE_RESERVATION_CLAIM, HANDLE_RESERVATION_SCOPE } from "@/lib/oauth/handle-reservation";
import { disclosedSensitive, nationalIdDecision, splitLegalName, tierAllows, type Tier } from "@/lib/oauth/scope-rules";

type Row = Record<string, unknown>;

function sybilPepper(): string {
  const s = process.env["ROUT_SYBIL_PEPPER"] ?? "";
  if (s.length < 32) throw new Error("sybil_pepper_missing");
  return s;
}

/** Same subject the tokens carry: always the scoped subject from the vault. */
export async function getPairwiseSubject(userId: string, clientId: string): Promise<string> {
  const { scopedSubjectForClientId } = await import("@/lib/oauth/subject-vault.server");
  return scopedSubjectForClientId(userId, clientId);
}

type Identity = { tier: Tier; humanNullifier: string | null; legalName: string | null };

async function identityOf(userId: string): Promise<Identity> {
  const r = ((await sql`select tier_1_real_human, tier_2_legal_identity, identity_nullifier, national_id_nullifier, legal_name
    from public.verified_identities where user_id = ${userId} limit 1`) as Row[])[0];
  if (!r) return { tier: "none", humanNullifier: null, legalName: null };
  const tier: Tier = r["tier_2_legal_identity"] ? "tier_2" : r["tier_1_real_human"] || r["identity_nullifier"] ? "tier_1" : "none";
  const humanNullifier = (r["national_id_nullifier"] as string | null) ?? (r["identity_nullifier"] as string | null) ?? null;
  return { tier, humanNullifier, legalName: (r["legal_name"] as string | null) ?? null };
}

/** Verification tier only (no nullifier, no name): used by the handle reservation claim. */
export async function identityTier(userId: string): Promise<Tier> {
  return (await identityOf(userId)).tier;
}

export async function getAppSybilNullifier(userId: string, clientId: string): Promise<string | null> {
  const id = await identityOf(userId);
  if (!id.humanNullifier || id.tier === "none") return null;
  return appSybilNullifier(sybilPepper(), clientId, id.humanNullifier);
}

export class ScopeForbiddenError extends Error {
  readonly status = 403;
  constructor(readonly code: string) {
    super(code);
  }
}

async function hashIp(ip: string | null): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${sybilPepper()}|${ip ?? "unknown"}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Full userinfo body. Throws ScopeForbiddenError (403) for a national_id request that fails its rules. */
export async function generateUserInfoResponse(
  userId: string,
  clientId: string,
  grantedScopes: string[],
  opts: { sub: string; acr?: string | null; ip?: string | null } ,
): Promise<Record<string, unknown>> {
  const { identityClaims, getClientByClientId, isTrustedKycPartner } = await import("@/lib/oauth/provider.server");
  const client = await getClientByClientId(clientId);
  const id = await identityOf(userId);
  if (grantedScopes.includes("identity:national_id")) {
    const { STRICT_ACR } = await import("@/lib/oauth/step-up");
    const d = nationalIdDecision({ trustedPartner: await isTrustedKycPartner(clientId), tier: id.tier, stepUp: opts.acr === STRICT_ACR });
    if (!d.ok) throw new ScopeForbiddenError(d.error);
  }
  // `profile:read` gives the same basic profile claims as `profile`.
  const base = grantedScopes.includes("profile:read") && !grantedScopes.includes("profile") ? [...grantedScopes, "profile"] : grantedScopes;
  const claims = await identityClaims(userId, base, { handleSync: Boolean(client?.handleSyncEnabled), clientId });
  if (grantedScopes.includes("sybil:verify") && tierAllows("sybil:verify", id.tier)) {
    const n = await getAppSybilNullifier(userId, clientId);
    claims["is_unique_human"] = Boolean(n);
    if (n) claims["app_sybil_nullifier"] = n;
  } else if (grantedScopes.includes("sybil:verify")) {
    claims["is_unique_human"] = false;
  }
  if (grantedScopes.includes("identity:legal_name") && tierAllows("identity:legal_name", id.tier)) {
    Object.assign(claims, splitLegalName(id.legalName));
  }
  if (grantedScopes.includes("identity:national_id")) {
    // ROUT keeps only a one-way nullifier, never the registry number itself.
    claims["national_registry_number"] = null;
  }
  const disclosed = disclosedSensitive(grantedScopes, id.tier);
  if (disclosed.length) {
    // No sensitive claims may leave ROUT without their disclosure record.
    await sql`insert into public.identity_disclosure_logs (user_id, client_id, disclosed_scopes, ip_hash)
      values (${userId}, ${clientId}, ${disclosed}, ${await hashIp(opts.ip ?? null)})`;
    const { appendEncryptedUserEvent } = await import("@/lib/ledger/ledger.server");
    await appendEncryptedUserEvent(userId, { event_type: "identity_disclosure", app_name: client?.name ?? clientId, scopes: disclosed, timestamp: new Date().toISOString() });
  }
  if (grantedScopes.includes(HANDLE_RESERVATION_SCOPE)) {
    const { handleReservationClaim } = await import("@/lib/oauth/handle-reservation.server");
    claims[HANDLE_RESERVATION_CLAIM] = await handleReservationClaim(userId, clientId, opts.sub);
  }
  return { sub: opts.sub, ...claims };
}
