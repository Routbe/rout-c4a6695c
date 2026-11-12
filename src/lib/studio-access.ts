/** Verified-profile tab is unlocked only for verified, active (or paid) accounts. Pure + testable. */
export function verifiedTabUnlocked(state: { verified: boolean; status?: string | null; isPaid?: boolean } | null | undefined): boolean {
  if (!state) return false;
  return state.verified && (state.status === "active" || Boolean(state.isPaid));
}

export type VerificationCta = "verified" | "pending" | "request";

/** What the studio shows instead of / as the verification button. Pure + testable. */
export function verificationCta(
  state: { verified: boolean; status?: string | null; isPaid?: boolean } | null | undefined,
): VerificationCta {
  if (!state) return "request";
  if (state.verified) return "verified";
  if (state.status === "pending" || state.status === "pending_review") return "pending";
  return "request";
}
