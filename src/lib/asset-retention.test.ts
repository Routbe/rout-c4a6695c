import { describe, expect, it } from "vitest";
import { assetStatus, retentionFor, withinQuota } from "./asset-retention";

const NOW = Date.UTC(2026, 0, 1);
const free = { verified: false, isPro: false };

describe("asset retention", () => {
  it("free users default to 7 days", () => {
    const r = retentionFor(free, undefined, NOW);
    expect(r.isLifetime).toBe(false);
    expect(r.expiresAt?.getTime()).toBe(NOW + 7 * 86_400_000);
  });
  it("free users are capped at 90 days", () => {
    expect(retentionFor(free, 365, NOW).expiresAt?.getTime()).toBe(NOW + 90 * 86_400_000);
  });
  it("verified or pro users keep files permanently", () => {
    expect(retentionFor({ verified: true, isPro: false })).toEqual({ isLifetime: true, expiresAt: null });
    expect(retentionFor({ verified: false, isPro: true }).isLifetime).toBe(true);
  });
  it("quota is 50 files or 500 MB", () => {
    expect(withinQuota({ files: 49, bytes: 0 }, 1)).toBe(true);
    expect(withinQuota({ files: 50, bytes: 0 }, 1)).toBe(false);
    expect(withinQuota({ files: 1, bytes: 500 * 1024 * 1024 }, 1)).toBe(false);
  });
  it("computes days remaining and expiry", () => {
    expect(assetStatus(new Date(NOW + 2.5 * 86_400_000), false, NOW)).toEqual({ daysRemaining: 3, isExpired: false });
    expect(assetStatus(new Date(NOW - 1), false, NOW).isExpired).toBe(true);
    expect(assetStatus(null, true, NOW).daysRemaining).toBeNull();
  });
});
