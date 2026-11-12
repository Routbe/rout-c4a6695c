/**
 * Verifiable claims: yes/no outcomes only (never a birth date or an ID document).
 * Pure and browser-safe; shared by the Trust widget and the future OIDC scopes.
 */

export type ClaimProvider = "none" | "itsme" | "eidas";

export type VerifiedClaims = {
  isVerifiedHuman: boolean;
  isOver18: boolean;
  provider: ClaimProvider;
  verifiedAt: string | null;
};

export const NO_CLAIMS: VerifiedClaims = { isVerifiedHuman: false, isOver18: false, provider: "none", verifiedAt: null };

export type TrustTier = 0 | 1 | 2;

/** Tier 0 = anonymous, 1 = verified human, 2 = verified human and 18+. */
export function trustTier(c: VerifiedClaims): TrustTier {
  if (!c.isVerifiedHuman) return 0;
  return c.isOver18 ? 2 : 1;
}

export const TIER_LABELS: Record<TrustTier, string> = {
  0: "Tier 0 – Anoniem",
  1: "Tier 1 – Echte mens",
  2: "Tier 2 – Echte mens, 18+",
};

/** Normalises a database row; any unproven claim reads as false. */
export function claimsFromRow(row: Record<string, unknown> | null | undefined): VerifiedClaims {
  if (!row) return NO_CLAIMS;
  const provider = row["verification_provider"];
  const p: ClaimProvider = provider === "itsme" || provider === "eidas" ? provider : "none";
  const verifiedAt = typeof row["verified_at"] === "string" ? row["verified_at"] : null;
  const proven = p !== "none" && verifiedAt !== null;
  return {
    isVerifiedHuman: proven && row["is_verified_human"] === true,
    isOver18: proven && row["is_over_18"] === true,
    provider: p,
    verifiedAt,
  };
}

/**
 * Planned "Login met ROUT" scopes. Not yet issued (not in SUPPORTED_SCOPES):
 * they go live together with a real verification partner. When granted, the
 * app receives only a boolean — never a name, birth date or document.
 */
export const VERIFIABLE_CLAIM_SCOPES = ["verify_human", "verify_18_plus"] as const;
export type VerifiableClaimScope = (typeof VERIFIABLE_CLAIM_SCOPES)[number];

export function verifiableClaimPayload(
  grantedScopes: readonly string[],
  claims: VerifiedClaims,
): { verified_human?: boolean; over_18?: boolean } {
  const out: { verified_human?: boolean; over_18?: boolean } = {};
  if (grantedScopes.includes("verify_human")) out.verified_human = claims.isVerifiedHuman;
  if (grantedScopes.includes("verify_18_plus")) out.over_18 = claims.isOver18;
  return out;
}
