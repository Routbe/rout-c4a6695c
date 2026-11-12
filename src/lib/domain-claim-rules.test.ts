import { describe, expect, it } from "vitest";
import { claimRecordName, claimRecordValue, domainClaimHandle, DOMAIN_CLAIM_GRACE_MS, nextClaimStatus } from "./domain-claim-rules";

describe("DNS handle claims", () => {
  it("delplanche.com unlocks handle delplanche", () => {
    expect(domainClaimHandle("Delplanche.com")).toEqual({ domain: "delplanche.com", handle: "delplanche" });
  });
  it("multi-part public suffixes use the registrable label", () => {
    expect(domainClaimHandle("bedrijf.co.uk").handle).toBe("bedrijf");
  });
  it("refuses private suffixes like github.io", () => {
    expect(() => domainClaimHandle("someone.github.io")).toThrow("private_suffix");
  });
  it("refuses subdomains", () => {
    expect(() => domainClaimHandle("shop.delplanche.com")).toThrow("not_apex");
  });
  it("record lives at _rout.<domain>", () => {
    expect(claimRecordName("delplanche.com")).toBe("_rout.delplanche.com");
  });
  it("record value is bound to user and domain", async () => {
    const k = "k".repeat(32);
    const a = await claimRecordValue(k, "user-1", "delplanche.com");
    expect(a).toMatch(/^rout-verify=[A-Za-z0-9_-]{43}$/);
    expect(await claimRecordValue(k, "user-2", "delplanche.com")).not.toBe(a);
    expect(await claimRecordValue(k, "user-1", "other.com")).not.toBe(a);
  });
  it("a failing record enters grace and is released after 30 days", () => {
    const t0 = 1_000_000;
    expect(nextClaimStatus("verified", false, null, t0)).toEqual({ status: "grace", failingSince: t0 });
    expect(nextClaimStatus("grace", false, t0, t0 + DOMAIN_CLAIM_GRACE_MS - 1).status).toBe("grace");
    expect(nextClaimStatus("grace", false, t0, t0 + DOMAIN_CLAIM_GRACE_MS).status).toBe("released");
  });
  it("a restored record ends the grace period", () => {
    expect(nextClaimStatus("grace", true, 5, 10)).toEqual({ status: "verified", failingSince: null });
  });
});
