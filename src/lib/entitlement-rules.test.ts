import { describe, expect, it } from "vitest";
import { canAccessFeature, isEntitledProfile } from "./entitlement-rules";

describe("isEntitledProfile", () => {
  it("blocks a free, unverified account", () => {
    expect(
      isEntitledProfile({
        is_paid: false,
        verified: false,
        is_early_believer: false,
        status: "active",
      }),
    ).toBe(false);
  });

  it("blocks a missing profile", () => {
    expect(isEntitledProfile(null)).toBe(false);
    expect(isEntitledProfile(undefined)).toBe(false);
  });

  it("allows paid, verified or early-believer accounts in good standing", () => {
    expect(isEntitledProfile({ is_paid: true, status: "active" })).toBe(true);
    expect(isEntitledProfile({ verified: true, status: "active" })).toBe(true);
    expect(isEntitledProfile({ is_early_believer: true, status: "active" })).toBe(true);
  });

  it("blocks banned, suspended or inactive accounts even when paid", () => {
    expect(isEntitledProfile({ is_paid: true, status: "active", is_banned: true })).toBe(false);
    expect(isEntitledProfile({ is_paid: true, status: "active", is_suspended: true })).toBe(false);
    expect(isEntitledProfile({ is_paid: true, status: "pending" })).toBe(false);
  });
});

describe("canAccessFeature", () => {
  it("blocks anonymous / failed entitlement lookups", () => {
    expect(canAccessFeature(null, "domains")).toBe(false);
    expect(canAccessFeature(null, "bluesky")).toBe(false);
  });

  it("blocks free users from Domains and Bluesky", () => {
    const free = { entitled: false, verified: false };
    expect(canAccessFeature(free, "domains")).toBe(false);
    expect(canAccessFeature(free, "bluesky")).toBe(false);
  });

  it("blocks entitled-but-unverified users from Bluesky only", () => {
    const unverified = { entitled: true, verified: false };
    expect(canAccessFeature(unverified, "domains")).toBe(true);
    expect(canAccessFeature(unverified, "bluesky")).toBe(false);
  });

  it("allows verified paying members everywhere", () => {
    const full = { entitled: true, verified: true };
    expect(canAccessFeature(full, "domains")).toBe(true);
    expect(canAccessFeature(full, "bluesky")).toBe(true);
  });
});
