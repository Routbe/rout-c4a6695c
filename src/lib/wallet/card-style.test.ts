import { describe, expect, it } from "vitest";
import { contrastRatio, validateCardStyle } from "./card-style";

describe("card style check", () => {
  it("black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });
  it("accepts AA contrast", () => {
    expect(validateCardStyle("#ffffff", "#18181b").ok).toBe(true);
  });
  it("rejects low contrast below 4.5:1", () => {
    const v = validateCardStyle("#777777", "#666666");
    expect(v.ok).toBe(false);
  });
  it("rejects invalid colours", () => {
    expect(validateCardStyle("red", "#000000")).toEqual({ ok: false, ratio: 0, reason: "invalid" });
  });
});
