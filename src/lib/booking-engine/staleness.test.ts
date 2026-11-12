import { describe, expect, it } from "vitest";
import { isAvailabilityStale } from "./staleness";

describe("availability staleness", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  it("missing cache is stale", () => expect(isAvailabilityStale(null, now)).toBe(true));
  it("4 minutes old is fresh", () => expect(isAvailabilityStale("2026-10-28T11:56:00Z", now)).toBe(false));
  it("6 minutes old is stale", () => expect(isAvailabilityStale("2026-10-28T11:54:00Z", now)).toBe(true));
});
