import { describe, expect, it } from "vitest";
import { decidePresign, earlyVerifiedGrants, effectivePlan, plusCredits, storageQuotaBytes } from "./entitlement-engine";

describe("entitlement engine", () => {
  it("refuses any upload for an unverified workspace with 403 Storage Quota Exceeded", () => {
    const d = decidePresign({ scopeType: "workspace", basePlan: "pro", verified: false, overrides: [] }, 0, 1);
    expect(d).toEqual({ ok: false, status: 403, error: "Storage Quota Exceeded" });
  });

  it("free workspaces have a 0 MB quota even when verified", () => {
    expect(storageQuotaBytes({ scopeType: "workspace", basePlan: "free", verified: true, overrides: [] })).toBe(0);
  });

  it("PRO_FOR_LIFE lifts a free personal account to pro", () => {
    expect(effectivePlan({ scopeType: "user", basePlan: null, verified: true, overrides: [{ entitlement_key: "PRO_FOR_LIFE", value: "true" }] })).toBe("pro");
  });

  it("early verification grants PRO_FOR_LIFE and exactly one Plus workspace credit", () => {
    const g = earlyVerifiedGrants("u1");
    expect(g.find((x) => x.entitlement_key === "PRO_FOR_LIFE")?.value).toBe("true");
    expect(plusCredits(g)).toBe(1);
  });

  it("a redeemed Plus workspace gets the Plus quota", () => {
    const input = { scopeType: "workspace" as const, basePlan: "free", verified: true, overrides: [{ entitlement_key: "WORKSPACE_PLAN", value: "plus" }] };
    expect(effectivePlan(input)).toBe("plus");
    expect(decidePresign(input, 0, 1024).ok).toBe(true);
  });
});
