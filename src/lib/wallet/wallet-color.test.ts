import { describe, expect, it } from "vitest";
import { contrastRatio, harmonizeBackground, hexToOklch, oklchToHex, pickLogoTone, HARMONY } from "./wallet-color";

describe("perceptual colour harmonisation", () => {
  it("round-trips sRGB through OKLCH", () => {
    for (const hex of ["#ff0000", "#41db97", "#123456", "#ffffff"]) expect(oklchToHex(hexToOklch(hex)!)).toBe(hex);
  });
  it.each(["#ff00ff", "#ffff00", "#0000ff", "#41db97", "#ff0000"])("maps coloured %s into the jewel-tone band", (hex) => {
    const out = harmonizeBackground(hex);
    const lch = hexToOklch(out)!;
    expect(lch.L).toBeGreaterThanOrEqual(0.25);
    expect(lch.L).toBeLessThanOrEqual(HARMONY.maxL + 0.005);
    expect(lch.C).toBeGreaterThanOrEqual(HARMONY.minC - 0.005);
    expect(lch.C).toBeLessThanOrEqual(HARMONY.maxC + 0.005);
    expect(contrastRatio("#ffffff", out)).toBeGreaterThanOrEqual(HARMONY.minWhiteContrast);
  });
  it.each(["#ffffff", "#000000", "#808080"])("turns neutral %s into graphite", (hex) => {
    expect(harmonizeBackground(hex)).toBe(oklchToHex(HARMONY.graphite));
  });
  it("keeps the hue of the member colour", () => {
    const src = hexToOklch("#ff0000")!.h, out = hexToOklch(harmonizeBackground("#ff0000"))!.h;
    expect(Math.abs(src - out)).toBeLessThan(0.15);
  });
  it("falls back for invalid input", () => expect(harmonizeBackground("nope")).toBe("#1f2128"));
  it("picks the light crest on dark and the dark crest on light", () => {
    expect(pickLogoTone(harmonizeBackground("#ff00ff"))).toBe("light");
    expect(pickLogoTone("#f4f1ea")).toBe("dark");
  });
});
