import { sql } from "@/lib/neon";
import { DIDIT_MONTHLY_LIMIT, monthKey, normalizeRealName, type IdentityProvider } from "./identity-rules";
import { isLegalProvider, verificationDecision } from "./identity-tiers";

/** Server-side pepper; ruwe provider-ID's worden nooit opgeslagen. */
function pepper(): string {
  const p = process.env["IDENTITY_HASH_PEPPER"];
  if (!p) throw new Error("identity_not_configured");
  return p;
}

export async function hashHumanId(provider: IdentityProvider, rawId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  // W-pairwise-ID's en documenthashes vormen aparte naamruimtes.
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${provider}:${rawId.trim().toUpperCase()}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function providerConfigured(provider: IdentityProvider): boolean {
  if (!process.env["IDENTITY_HASH_PEPPER"]) return false;
  if (provider === "w_identity")
    return Boolean(process.env["W_IDENTITY_ISSUER"] && process.env["W_IDENTITY_CLIENT_ID"] && process.env["W_IDENTITY_CLIENT_SECRET"]);
  if (provider === "didit")
    return Boolean(process.env["DIDIT_API_KEY"] && process.env["DIDIT_WORKFLOW_ID"] && process.env["DIDIT_WEBHOOK_SECRET"]);
  return true;
}

export async function diditSuccessCount(): Promise<number> {
  const rows = (await sql`select success_count from public.didit_monthly_usage where month = ${monthKey()}`) as { success_count: number }[];
  return Number(rows[0]?.success_count ?? 0);
}

export async function getIdentityStatus(userId: string) {
  const rows = (await sql`select iv.is_verified, iv.verified_real_name, iv.verification_provider, iv.verified_at,
      vi.tier_1_real_human, vi.tier_2_legal_identity, vi.legal_name
    from public.identity_verifications iv
    left join public.verified_identities vi on vi.user_id = iv.user_id
    where iv.user_id = ${userId}`.catch(() => [])) as Record<string, unknown>[];
  const r = rows[0];
  const provider = (r?.["verification_provider"] as IdentityProvider | null) ?? null;
  const isVerified = Boolean(r?.["is_verified"]);
  const legacyLegal = isVerified && provider === "didit";
  return {
    isVerified,
    verifiedRealName: (r?.["legal_name"] as string | null) ?? (legacyLegal ? ((r?.["verified_real_name"] as string | null) ?? null) : null),
    provider,
    verifiedAt: r?.["verified_at"] ? String(r["verified_at"]) : null,
    tier1RealHuman: isVerified || Boolean(r?.["tier_1_real_human"]),
    tier2LegalIdentity: Boolean(r?.["tier_2_legal_identity"]) || legacyLegal,
  };
}

export async function createSession(userId: string, provider: IdentityProvider, codeVerifier: string | null) {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const state = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  await sql`delete from public.identity_verification_sessions where expires_at < now()`;
  await sql`insert into public.identity_verification_sessions (state, user_id, provider, code_verifier, expires_at)
    values (${state}, ${userId}, ${provider}, ${codeVerifier}, now() + interval '30 minutes')`;
  return state;
}

/** Single-use: verwijdert de sessie en geeft eigenaar terug. */
export async function consumeSession(state: string, provider: IdentityProvider) {
  const rows = (await sql`delete from public.identity_verification_sessions
    where state = ${state} and provider = ${provider} and expires_at > now()
    returning user_id, code_verifier`) as { user_id: string; code_verifier: string | null }[];
  return rows[0] ?? null;
}

export type CompleteResult = { ok: true } | { ok: false; reason: "duplicate_human" | "already_verified" | "invalid_name" | "limit_reached" };

/**
 * Markeert een gebruiker als geverifieerd. De UNIQUE-constraint op
 * unique_human_id handhaaft "1 account per persoon"; de geverifieerde naam
 * overschrijft de profielnaam. Voor Didit wordt de maandteller in dezelfde
 * statement verhoogd (alleen bij succes, en nooit boven de limiet).
 */
export async function completeVerification(input: {
  userId: string;
  provider: IdentityProvider;
  rawHumanId: string;
  realName: string;
}): Promise<CompleteResult> {
  const name = normalizeRealName(input.realName);
  if (!name) return { ok: false, reason: "invalid_name" };
  const humanId = await hashHumanId(input.provider, input.rawHumanId);

  const existing = await getIdentityStatus(input.userId);
  const decision = verificationDecision(existing, input.provider);
  if (decision === "reject") return { ok: false, reason: "already_verified" };

  if (input.provider === "didit") {
    const bumped = (await sql`insert into public.didit_monthly_usage (month, success_count) values (${monthKey()}, 1)
      on conflict (month) do update set success_count = didit_monthly_usage.success_count + 1
      where didit_monthly_usage.success_count < ${DIDIT_MONTHLY_LIMIT}
      returning success_count`) as unknown[];
    if (bumped.length === 0) return { ok: false, reason: "limit_reached" };
  }

  if (decision === "upgrade") {
    // Tier 1 -> tier 2: the first proof stays immutable; the legal name lives on verified_identities.
    try {
      await sql`update public.verified_identities set tier_2_legal_identity = true, tier = 'tier_2_legal_identity',
          national_id_nullifier = ${humanId}, legal_name = ${name}, verified_at = now()
        where user_id = ${input.userId}`;
    } catch (error) {
      await sql`update public.didit_monthly_usage set success_count = greatest(success_count - 1, 0) where month = ${monthKey()}`;
      if (/duplicate|unique/i.test(String((error as Error)?.message))) return { ok: false, reason: "duplicate_human" };
      throw error;
    }
    await sql`update public.profiles set display_name = ${name}, updated_at = now() where id = ${input.userId}`;
    return { ok: true };
  }

  try {
    await sql`insert into public.identity_verifications
        (user_id, is_verified, verified_real_name, verification_provider, unique_human_id, verified_at, updated_at)
      values (${input.userId}, true, ${name}, ${input.provider}, ${humanId}, now(), now())
      on conflict (user_id) do update set is_verified = true, verified_real_name = excluded.verified_real_name,
        verification_provider = excluded.verification_provider, unique_human_id = excluded.unique_human_id,
        verified_at = now(), updated_at = now()
      where identity_verifications.is_verified = false`;
    const legal = isLegalProvider(input.provider);
    await sql`insert into public.verified_identities
        (user_id, identity_nullifier, provider, tier, tier_1_real_human, tier_2_legal_identity,
         national_id_nullifier, provider_sub_nullifier, legal_name)
      values (${input.userId}, ${humanId}, ${input.provider}, ${legal ? "tier_2_legal_identity" : "tier_1_real_human"},
        true, ${legal}, ${legal ? humanId : null}, ${legal ? null : humanId}, ${legal ? name : null})
      on conflict (user_id) do nothing`;
  } catch (error) {
    if (input.provider === "didit") {
      await sql`update public.didit_monthly_usage set success_count = greatest(success_count - 1, 0) where month = ${monthKey()}`;
    }
    if (/duplicate|unique/i.test(String((error as Error)?.message))) return { ok: false, reason: "duplicate_human" };
    throw error;
  }
  // Only a legal (document) name replaces the profile name; tier 1 stays pseudonymous.
  if (isLegalProvider(input.provider)) {
    await sql`update public.profiles set display_name = ${name}, updated_at = now() where id = ${input.userId}`;
  }
  return { ok: true };
}

/** Voor profielopslag: de onwijzigbare naam, of null. */
export async function lockedRealName(userId: string): Promise<string | null> {
  const s = await getIdentityStatus(userId);
  return s.isVerified ? s.verifiedRealName : null;
}
