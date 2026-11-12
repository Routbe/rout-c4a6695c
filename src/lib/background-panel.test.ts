import { describe, expect, it } from "vitest";
import { gradientCss, normalizeGradientDirection, presetPrefEntries, normalizeDesignPrefs, GRADIENT_PRESETS } from "./profile-design";

describe("ROUT-preset click", () => {
  it("turns the customize switch off", () => {
    const entries = Object.fromEntries(presetPrefEntries({ wallpaperType: "gradient", backgroundCustom: true }));
    expect(entries.backgroundCustom).toBe(false);
    expect(entries.wallpaperType).toBe("gradient");
  });
});

describe("gradient direction", () => {
  it("missing or unknown falls back to the original look", () => {
    expect(normalizeGradientDirection(undefined)).toBe("auto");
    expect(normalizeGradientDirection("sideways")).toBe("auto");
    expect(normalizeDesignPrefs({}).wallpaperGradientDirection).toBe("auto");
    expect(gradientCss("sunrise")).toBe(GRADIENT_PRESETS.find((g) => g.id === "sunrise")!.css);
  });
  it("left to right uses 90deg", () => {
    expect(gradientCss("sunrise", "to-right")).toContain("linear-gradient(90deg,");
  });
  it("radial turns the gradient radial", () => {
    expect(gradientCss("sunrise", "radial")).toContain("radial-gradient(circle at 50% 35%,");
    expect(gradientCss("sunrise", "radial")).not.toContain("linear-gradient");
  });
});
