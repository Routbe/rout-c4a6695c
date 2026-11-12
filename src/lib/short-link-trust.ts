/**
 * Pure short-link trust rule: who may redirect visitors straight to an external
 * site without the "Je verlaat ROUT" page.
 */
export interface LinkOwnerSignals {
  tier1RealHuman: boolean;
  tier2LegalIdentity: boolean;
  /** Legacy profile-verified flag. */
  verified: boolean;
  emailVerified: boolean;
  accountCreatedAt: Date | null;
}

/** An email-only account must be at least this old before its links skip the warning. */
export const EMAIL_TRUST_MIN_AGE_DAYS = 7;

export function isTrustedLinkOwner(s: LinkOwnerSignals | null, _now: Date = new Date()): boolean {
  if (!s) return false;
  return s.tier1RealHuman || s.tier2LegalIdentity;
}
