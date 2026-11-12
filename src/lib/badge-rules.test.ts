import { describe, expect, it } from "vitest";
import { publicBadgeKind } from "./badge-rules";

const base = { verified: true, isBusiness: false, isInfluencer: false, badgeVisible: true, badgeType: "verified" as const };

describe("publicBadgeKind", () => {
  it("never shows a trust mark for an unverified profile", () => {
    expect(publicBadgeKind({ ...base, verified: false })).toBeNull();
    expect(publicBadgeKind({ ...base, verified: false, badgeType: "human" })).toBeNull();
  });
  it("respects the owner hiding the badge", () => {
    expect(publicBadgeKind({ ...base, badgeVisible: false })).toBeNull();
    expect(publicBadgeKind({ ...base, badgeType: "none" })).toBeNull();
  });
  it("drops the badge when the legal identity check was withdrawn", () => {
    expect(publicBadgeKind({ ...base, legalIdentityVerified: false })).toBeNull();
  });
  it("shows the privacy shield only for a verified member who chose it", () => {
    expect(publicBadgeKind({ ...base, badgeType: "human" })).toBe("human");
  });
  it("business and influencer badges come from server flags, not the chosen type", () => {
    expect(publicBadgeKind({ ...base, badgeType: "influencer" })).toBe("verified");
    expect(publicBadgeKind({ ...base, isInfluencer: true })).toBe("influencer");
    expect(publicBadgeKind({ ...base, isBusiness: true, isInfluencer: true })).toBe("domain");
  });
});
