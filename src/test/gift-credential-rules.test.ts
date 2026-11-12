import { describe, expect, it } from "vitest";
import { giftDiscount, giftIssueSchema, requireGiftActivation } from "@/lib/gift-issue-rules";
import { credentialVisible, mayIssueCredential } from "@/lib/credential-rules";

describe("Gift issuance", () => {
  it("retains a fixed gift's monetary value", () => {
    expect(giftDiscount(giftIssueSchema.parse({ kind: "fixed", amountCents: 2500 }))).toEqual({ percentOff: 0, amountOffCents: 2500, maxDiscountCents: null });
  });
  it("percentage is a discount, never a balance", () => {
    expect(giftDiscount(giftIssueSchema.parse({ kind: "percentage", percentOff: 25, maxDiscountCents: 1000 }))).toEqual({ percentOff: 25, amountOffCents: 0, maxDiscountCents: 1000 });
  });
  it("preserves the existing €5–€500 fixed range", () => {
    expect(giftIssueSchema.safeParse({ amountCents: 499 }).success).toBe(false);
    expect(giftIssueSchema.safeParse({ amountCents: 500 }).success).toBe(true);
    expect(giftIssueSchema.safeParse({ amountCents: 50_000 }).success).toBe(true);
    expect(giftIssueSchema.safeParse({ amountCents: 50_001 }).success).toBe(false);
  });
  it("does not report missing activation as success", () => {
    expect(() => requireGiftActivation("not_found")).toThrow("gift_activation_failed");
  });
  it("account recipients do not require a private email in browser input", () => {
    expect(giftIssueSchema.safeParse({ amountCents: 2500, sendEmail: true, recipientUserId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(giftIssueSchema.safeParse({ amountCents: 2500, sendEmail: true }).success).toBe(false);
  });
  it("percentage must be between one and one hundred", () => {
    expect(giftIssueSchema.safeParse({ kind: "percentage", percentOff: 0 }).success).toBe(false);
    expect(giftIssueSchema.safeParse({ kind: "percentage", percentOff: 101 }).success).toBe(false);
  });
});

describe("Recipient-controlled credentials", () => {
  it("missing preferences are private", () => {
    expect(credentialVisible({}, "name", true, true)).toBe(false);
    expect(credentialVisible({}, "badges", true, true)).toBe(false);
  });
  it("name and badge choices are independent", () => {
    expect(credentialVisible({ showOnName: true, showInBadges: false }, "name", true, true)).toBe(true);
    expect(credentialVisible({ showOnName: true, showInBadges: false }, "badges", true, true)).toBe(false);
  });
  it("revocation stops publication", () => {
    expect(credentialVisible({ showInBadges: true, revokedAt: "2026-10-17" }, "badges", true, true)).toBe(false);
  });
  it("rejection stops publication", () => {
    expect(credentialVisible({ showOnName: true, rejectedAt: "2026-10-17" }, "name", true, true)).toBe(false);
  });
  it("profile-level privacy still applies", () => {
    expect(credentialVisible({ showOnName: true }, "name", false, true)).toBe(false);
    expect(credentialVisible({ showInBadges: true }, "badges", true, false)).toBe(false);
  });
  it("personal issuance requires the real owner", () => {
    expect(mayIssueCredential("a", "a", null, null)).toBe(true);
    expect(mayIssueCredential("a", "b", null, null)).toBe(false);
  });
  it("workspace editors cannot issue", () => {
    expect(mayIssueCredential("a", "b", "workspace", "editor")).toBe(false);
    expect(mayIssueCredential("a", "b", "workspace", "developer")).toBe(true);
  });
});