import type { BadgeType } from "@/lib/profile-display";

/** Which trust badge a public root profile may show outside its own page (embed badge, share image). */
export type PublicBadge = "verified" | "human" | "domain" | "influencer" | null;

export function publicBadgeKind(input: {
  verified: boolean;
  legalIdentityVerified?: boolean | null;
  isBusiness: boolean;
  isInfluencer: boolean;
  badgeVisible: boolean;
  badgeType: BadgeType;
}): PublicBadge {
  // Same gate as the profile page: proven identity, and the owner did not hide the badge.
  if (!input.verified || input.legalIdentityVerified === false || !input.badgeVisible || input.badgeType === "none") return null;
  if (input.isBusiness) return "domain";
  if (input.isInfluencer) return "influencer";
  return input.badgeType === "human" ? "human" : "verified";
}
