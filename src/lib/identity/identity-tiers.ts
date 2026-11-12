/**
 * Two-tier identity engine (pure, unit-tested).
 * Tier 1 "real human": proven unique person, pseudonym-safe (W Identity, Didit; passkey only as supporting proof).
 * Tier 2 "legal identity": legal name verified from a government document (Didit passport/eID).
 */
export type IdentityProviderId = "w_identity" | "didit" | "itsme" | "eid" | "manual" | "passkey";

/** Providers whose result is a legal name from a government document. */
const LEGAL_PROVIDERS: readonly IdentityProviderId[] = ["didit", "itsme", "eid"];
/** Providers that prove uniqueness on their own. A passkey proves device ownership, not uniqueness. */
const UNIQUE_HUMAN_PROVIDERS: readonly IdentityProviderId[] = ["w_identity", "didit", "itsme", "eid", "manual"];

export type IdentityTiers = { tier1RealHuman: boolean; tier2LegalIdentity: boolean };

export function tiersFor(proofs: ReadonlyArray<{ provider: IdentityProviderId | string | null; verified: boolean }>): IdentityTiers {
  const ok = proofs.filter((p) => p.verified && p.provider) as { provider: IdentityProviderId }[];
  const tier2LegalIdentity = ok.some((p) => LEGAL_PROVIDERS.includes(p.provider));
  const tier1RealHuman = tier2LegalIdentity || ok.some((p) => UNIQUE_HUMAN_PROVIDERS.includes(p.provider));
  return { tier1RealHuman, tier2LegalIdentity };
}

export type ProfileSurface = "root" | "alias";

/** What a public page may show. The alias page never shows the legal name. */
export function badgesFor(surface: ProfileSurface, tiers: IdentityTiers, opts: { aliasHumanBadgeOn: boolean }) {
  if (surface === "root") {
    return { blueMark: tiers.tier2LegalIdentity, humanBadge: false, showLegalName: tiers.tier2LegalIdentity };
  }
  return {
    blueMark: false,
    humanBadge: opts.aliasHumanBadgeOn && (tiers.tier1RealHuman || tiers.tier2LegalIdentity),
    showLegalName: false,
  };
}

export function isLegalProvider(provider: IdentityProviderId | string | null): boolean {
  return Boolean(provider) && LEGAL_PROVIDERS.includes(provider as IdentityProviderId);
}

/**
 * What a new successful proof does: "first" = first verification, "upgrade" = tier 1 account adds a legal
 * identity, "reject" = nothing to gain (already tier 2, or another tier-1 proof on a verified account).
 */
export function verificationDecision(
  current: { isVerified: boolean; tier2LegalIdentity: boolean },
  provider: IdentityProviderId | string,
): "first" | "upgrade" | "reject" {
  if (!current.isVerified) return "first";
  if (!current.tier2LegalIdentity && isLegalProvider(provider)) return "upgrade";
  return "reject";
}
