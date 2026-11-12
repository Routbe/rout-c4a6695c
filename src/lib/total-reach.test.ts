import { describe, expect, it } from "vitest";
import { countsTowardsReach, isAutoReachProvider, parseCompactCount, sumReach } from "./total-reach";

describe("total reach", () => {
  it("sums only included integrations, manual count wins", () => {
    expect(
      sumReach([
        { includeInReach: true, followerCount: 100, manualCount: null },
        { includeInReach: true, followerCount: 50, manualCount: 2000 },
        { includeInReach: false, followerCount: 999, manualCount: null },
      ]),
    ).toBe(2100);
  });
  it("is zero with no integrations", () => {
    expect(sumReach([])).toBe(0);
  });
  it("auto-fetches only open platforms", () => {
    expect(isAutoReachProvider("bluesky")).toBe(true);
    expect(isAutoReachProvider("youtube")).toBe(true);
    expect(isAutoReachProvider("instagram")).toBe(false);
    expect(countsTowardsReach("monero")).toBe(false);
  });
  it("parses YouTube subscriber texts", () => {
    expect(parseCompactCount("12.3K subscribers")).toBe(12300);
    expect(parseCompactCount("1,234 subscribers")).toBe(1234);
    expect(parseCompactCount("2M")).toBe(2000000);
  });
});
