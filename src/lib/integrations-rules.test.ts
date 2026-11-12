import { describe, expect, it } from "vitest";
import { normalizeIntegrationValue, paymentUri, visibleForMode } from "./integrations-rules";

describe("integration values", () => {
  it("accepts a public Ethereum address and refuses junk", () => {
    expect(normalizeIntegrationValue("ethereum", "0x" + "a".repeat(40))).toBe("0x" + "a".repeat(40));
    expect(normalizeIntegrationValue("ethereum", "0x123")).toBeNull();
  });
  it("refuses a Monero private-key-length string", () => {
    expect(normalizeIntegrationValue("monero", "4" + "a".repeat(63))).toBeNull();
  });
  it("accepts a lightning address", () => {
    expect(normalizeIntegrationValue("lightning", "Me@Getalby.com")).toBe("me@getalby.com");
  });
  it("completes a bare wsocial.eu handle", () => {
    expect(normalizeIntegrationValue("wsocial", "@anna")).toBe("anna.wsocial.eu");
  });
  it("normalizes a YouTube handle and channel id", () => {
    expect(normalizeIntegrationValue("youtube", "mkbhd")).toBe("@mkbhd");
    expect(normalizeIntegrationValue("youtube", "UC" + "x".repeat(22))).toBe("UC" + "x".repeat(22));
  });
  it("refuses coming-soon providers", () => {
    expect(normalizeIntegrationValue("strava", "anna")).toBeNull();
  });
});

describe("pro/social routing", () => {
  const rows = [
    { id: 1, audience: "pro" as const },
    { id: 2, audience: "social" as const },
    { id: 3, audience: "both" as const },
  ];
  it("pro face shows pro + both", () => expect(visibleForMode(rows, "pro").map((r) => r.id)).toEqual([1, 3]));
  it("social face shows social + both", () => expect(visibleForMode(rows, "social").map((r) => r.id)).toEqual([2, 3]));
  it("builds payment URIs", () => expect(paymentUri("monero", "4abc")).toBe("monero:4abc"));
});
