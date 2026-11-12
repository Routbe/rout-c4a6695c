import { describe, expect, it } from "vitest";
import { CREATOR_MIN_REACH, isCreatorEligible } from "./creator-eligibility";

describe("creator badge eligibility", () => {
  it("requires 10,000 followers", () => expect(CREATOR_MIN_REACH).toBe(10_000));
  it("rejects 9,999", () => expect(isCreatorEligible(9_999)).toBe(false));
  it("accepts 10,000", () => expect(isCreatorEligible(10_000)).toBe(true));
});
