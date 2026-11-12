import { describe, expect, it } from "vitest";
import { premiumSpringPreset, profileSpringPreset } from "./spatial-motion";

describe("requested mechanical physics", () => {
  it("uses mass 1.2, stiffness 320 and damping 24 for general interaction", () => {
    expect(premiumSpringPreset).toEqual({ type: "spring", mass: 1.2, stiffness: 320, damping: 24 });
  });
  it("uses stiffness 400 and damping 25 for the account popover", () => {
    expect(profileSpringPreset.stiffness).toBe(400);
    expect(profileSpringPreset.damping).toBe(25);
  });
});