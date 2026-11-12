import { describe, expect, it } from "vitest";
import {
  AGENT_WORKSPACE_TTL_HOURS,
  agentProvisionInput,
  claimExpiry,
  claimFailure,
  claimState,
  claimUrl,
  generateClaimToken,
  hashClaimToken,
  isClaimToken,
  isWorkspaceSlug,
  provisionFailure,
} from "./agent-claims";

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

describe("claim tokens", () => {
  it("generates 64 lowercase hex characters", () => {
    const token = generateClaimToken(random);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(isClaimToken(token)).toBe(true);
  });
  it("never repeats", () => {
    expect(generateClaimToken(random)).not.toBe(generateClaimToken(random));
  });
  it("stores only the SHA-256 hash", async () => {
    const hash = await hashClaimToken("a".repeat(64));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe("a".repeat(64));
    expect(await hashClaimToken("a".repeat(64))).toBe(hash);
  });
  it("rejects malformed tokens", () => {
    expect(isClaimToken("")).toBe(false);
    expect(isClaimToken("A".repeat(64))).toBe(false);
    expect(isClaimToken("g".repeat(64))).toBe(false);
    expect(isClaimToken("a".repeat(63))).toBe(false);
  });
});

describe("zero-email provisioning", () => {
  const valid = { name: "Acme", slug: "acme" };
  it("rejects an e-mail field outright", () => {
    expect(agentProvisionInput.safeParse({ ...valid, email: "a@b.c" }).success).toBe(false);
  });
  it("rejects any unexpected field", () => {
    expect(agentProvisionInput.safeParse({ ...valid, owner_email: "a@b.c" }).success).toBe(false);
    expect(agentProvisionInput.safeParse({ ...valid, invite: "a@b.c" }).success).toBe(false);
  });
  it("accepts name, slug and optional description only", () => {
    expect(agentProvisionInput.safeParse(valid).success).toBe(true);
    expect(agentProvisionInput.safeParse({ ...valid, description: "d" }).success).toBe(true);
  });
});

describe("workspace slugs", () => {
  it("accepts lowercase alphanumerics with single hyphens", () => {
    expect(isWorkspaceSlug("acme")).toBe(true);
    expect(isWorkspaceSlug("acme-corp-2")).toBe(true);
  });
  it("rejects uppercase, edges, doubles and oversize", () => {
    expect(isWorkspaceSlug("Acme")).toBe(false);
    expect(isWorkspaceSlug("-acme")).toBe(false);
    expect(isWorkspaceSlug("acme-")).toBe(false);
    expect(isWorkspaceSlug("acme--corp")).toBe(false);
    expect(isWorkspaceSlug("ab")).toBe(false);
    expect(isWorkspaceSlug("a".repeat(49))).toBe(false);
  });
});

describe("24-hour lifecycle", () => {
  it("expires exactly 24 hours after creation", () => {
    const created = new Date("2026-11-02T09:00:00Z");
    expect(AGENT_WORKSPACE_TTL_HOURS).toBe(24);
    expect(claimExpiry(created).toISOString()).toBe("2026-11-03T09:00:00.000Z");
  });
  it("claim URLs point at the claim page", () => {
    expect(claimUrl("https://rout.be", "t".repeat(64))).toBe(`https://rout.be/claim/workspace/${"t".repeat(64)}`);
  });
});

describe("database failure mapping", () => {
  it("maps provisioning failures", () => {
    expect(provisionFailure("agent_quota_reached")).toBe("agent_quota_reached");
    expect(provisionFailure("slug_taken")).toBe("slug_taken");
    expect(provisionFailure("something else")).toBeNull();
  });
  it("maps claim failures", () => {
    expect(claimFailure("claim_not_found")).toBe("claim_not_found");
    expect(claimFailure("claim_used")).toBe("claim_used");
    expect(claimFailure("claim_expired")).toBe("claim_expired");
    expect(claimFailure("other")).toBeNull();
  });
  it("maps preview state", () => {
    expect(claimState(null)).toBe("invalid");
    expect(claimState({ claimed: false, expired: false })).toBe("open");
    expect(claimState({ claimed: true, expired: false })).toBe("claimed");
    expect(claimState({ claimed: false, expired: true })).toBe("expired");
  });
});
