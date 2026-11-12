import { describe, expect, it } from "vitest";
import { hexToHsl, hslToHex } from "./color-hsl";

describe("color-hsl", () => {
  it("converts pure red", () => {
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
    expect(hslToHex({ h: 0, s: 100, l: 50 })).toBe("#ff0000");
  });
  it("handles short hex and grey", () => {
    expect(hexToHsl("#fff")).toEqual({ h: 0, s: 0, l: 100 });
    expect(hslToHex({ h: 200, s: 0, l: 0 })).toBe("#000000");
  });
  it("rejects invalid hex", () => {
    expect(hexToHsl("nope")).toBeNull();
  });
  it("round-trips pure green", () => {
    expect(hslToHex(hexToHsl("#00ff00")!)).toBe("#00ff00");
  });
});
