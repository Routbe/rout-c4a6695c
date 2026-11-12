import { describe, expect, it } from "vitest";
import { bankIdentityStatus, webhookHealth } from "@/lib/admin-control-rules";

describe("finance identity signals", () => {
  it("accepts only an exact verified name match", () => {
    expect(bankIdentityStatus("Jona Dupont", "Jona Dupont", true)).toBe("match");
    expect(bankIdentityStatus("jona dupont", "Jona Dupont", true)).toBe("mismatch");
    expect(bankIdentityStatus("Jona Du Pont", "Jona Dupont", true)).toBe("mismatch");
  });
  it("does not treat unverified or missing identity as matched", () => {
    expect(bankIdentityStatus("Jona Dupont", "Jona Dupont", false)).toBe("unverified");
    expect(bankIdentityStatus("Jona Dupont", null, true)).toBe("unverified");
    expect(bankIdentityStatus(null, "Jona Dupont", true)).toBe("unverified");
  });
});
describe("webhook processing states", () => {
  it("distinguishes failures from in-progress deliveries", () => {
    expect(webhookHealth("failed")).toBe("failed");
    expect(webhookHealth("done")).toBe("success");
    expect(webhookHealth("processing")).toBe("pending");
    expect(webhookHealth("unknown")).toBe("pending");
  });
});