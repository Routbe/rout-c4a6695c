import { describe, expect, it } from "vitest";
import { claimLinkInput, claimState } from "@/lib/stamp-rules";

const input = { badgeId: "f107d66f-d93c-4c23-b942-056867a0351b", maxClaims: null, expiresAt: null, reason: null };
describe("stamp claim safety", () => {
  it("requires a claim cap or expiry", () => {
    expect(claimLinkInput.safeParse(input).success).toBe(false);
    expect(claimLinkInput.safeParse({ ...input, maxClaims: 50 }).success).toBe(true);
    expect(claimLinkInput.safeParse({ ...input, expiresAt: "2026-12-01T00:00:00.000Z" }).success).toBe(true);
  });
  it("exhausts a link exactly at its cap", () => {
    expect(claimState({ revoked: false, expiresAt: null, maxClaims: 50, claims: 49 })).toBe("open");
    expect(claimState({ revoked: false, expiresAt: null, maxClaims: 50, claims: 50 })).toBe("exhausted");
  });
  it("expires at the exact deadline", () => {
    const deadline = "2026-12-01T00:00:00.000Z";
    expect(claimState({ revoked: false, expiresAt: deadline, maxClaims: null, claims: 0 }, Date.parse(deadline))).toBe("expired");
  });
  it("rejects revoked links", () => {
    expect(claimState({ revoked: true, expiresAt: null, maxClaims: 50, claims: 0 })).toBe("invalid");
  });
});