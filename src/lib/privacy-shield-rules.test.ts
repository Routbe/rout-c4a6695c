import { describe, expect, it } from "vitest";
import { applyPrivacyShield } from "./privacy-shield-rules";

const row = (extra: Record<string, unknown> = {}) => ({ verified_legal_name: "Anna Peeters", business_name: "Peeters BV", country_code: "BE", ...extra });

describe("privacy shield on public profiles", () => {
  it("hides legal name, trade name and country for a human-only badge", () => {
    const p = row();
    applyPrivacyShield(p, { badgeType: "human", badgeVisible: true });
    expect(p).toMatchObject({ verified_legal_name: null, business_name: null, country_code: null });
  });
  it("hides the trade name of an approved business that hides its badge", () => {
    const p = row({ is_business: true });
    applyPrivacyShield(p, { badgeType: "verified", badgeVisible: false });
    expect(p.business_name).toBeNull();
    expect(p.verified_legal_name).toBeNull();
  });
  it("hides names of an approved influencer that shows no badge", () => {
    const p = row({ is_influencer: true });
    applyPrivacyShield(p, { badgeType: "none", badgeVisible: true });
    expect(p.business_name).toBeNull();
  });
  it("keeps names for a visible verified badge", () => {
    const p = row();
    applyPrivacyShield(p, { badgeType: "verified", badgeVisible: true });
    expect(p.verified_legal_name).toBe("Anna Peeters");
  });
  it("lets only approved accounts show names under the influencer badge", () => {
    const plain = row();
    applyPrivacyShield(plain, { badgeType: "influencer", badgeVisible: true });
    expect(plain.business_name).toBeNull();
    const approved = row({ is_influencer: true });
    applyPrivacyShield(approved, { badgeType: "influencer", badgeVisible: true });
    expect(approved.business_name).toBe("Peeters BV");
  });
});
