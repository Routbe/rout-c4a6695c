import { describe, expect, it } from "vitest";
import { claimsFromRow, NO_CLAIMS, trustTier, verifiableClaimPayload } from "./verified-claims";
import { SUPPORTED_SCOPES } from "./oauth/scope-rules";

describe("verified claims", () => {
  it("starts every member at Tier 0", () => {
    expect(trustTier(claimsFromRow(null))).toBe(0);
  });
  it("never trusts a claim without a provider and a verification time", () => {
    const c = claimsFromRow({ is_verified_human: true, is_over_18: true, verification_provider: "none", verified_at: null });
    expect(c.isVerifiedHuman).toBe(false);
    expect(c.isOver18).toBe(false);
  });
  it("reaches Tier 2 only as a verified human who is 18+", () => {
    const c = claimsFromRow({ is_verified_human: true, is_over_18: true, verification_provider: "itsme", verified_at: "2026-11-02T00:00:00Z" });
    expect(trustTier(c)).toBe(2);
  });
  it("returns only booleans for the age and human scopes", () => {
    const payload = verifiableClaimPayload(["openid", "verify_18_plus"], { ...NO_CLAIMS, isOver18: true });
    expect(payload).toEqual({ over_18: true });
  });
  it("does not issue the new scopes before a verification partner is live", () => {
    expect((SUPPORTED_SCOPES as readonly string[]).includes("verify_18_plus")).toBe(false);
    expect((SUPPORTED_SCOPES as readonly string[]).includes("verify_human")).toBe(false);
  });
});
