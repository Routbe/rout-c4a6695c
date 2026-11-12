import { describe, expect, it } from "vitest";
import { verificationCta } from "@/lib/studio-access";

describe("verificationCta", () => {
  it("verified member never sees the request button", () => {
    expect(verificationCta({ verified: true, status: "active" })).toBe("verified");
  });
  it("pending request shows no new request button", () => {
    expect(verificationCta({ verified: false, status: "pending" })).toBe("pending");
  });
  it("unverified member can request", () => {
    expect(verificationCta({ verified: false, status: "active" })).toBe("request");
  });
});
