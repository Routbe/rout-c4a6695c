import { describe, expect, it } from "vitest";
import { hasUniqueStyle, normalizeThemeOverrides, resolveComponentDesign } from "./theme-engine";

const global = { buttonVariant: "fill", buttonRadius: "rounded", fontPairing: "modern", buttonColor: null, buttonTextColor: null };

describe("scoped theme cascade", () => {
  it("preserves all twelve original typography choices in scoped designs", () => {
    const fonts = ["modern", "serif", "mono", "display", "editorial", "geometric", "brutal", "luxe", "handwritten", "futuristic", "classic", "condensed"];
    for (const fontPairing of fonts) {
      expect(normalizeThemeOverrides({ answers: { fontPairing } }).answers?.fontPairing).toBe(fontPairing);
    }
  });
  it("styles anonymous forms and answers independently", () => {
    const overrides = normalizeThemeOverrides({ questions: { buttonRadius: "pill" }, answers: { fontPairing: "serif" } });
    expect(resolveComponentDesign(global, overrides, "questions").buttonRadius).toBe("rounded");
    expect(resolveComponentDesign(global, overrides, "answers").buttonRadius).toBe("rounded");
    expect(resolveComponentDesign(global, overrides, "answers").fontPairing).toBe("serif");
  });
  it("falls back to global when a component has no override", () => {
    const d = resolveComponentDesign(global, {}, "booking");
    expect(d.buttonRadius).toBe("rounded");
    expect(d.hasButtonOverride).toBe(false);
  });

  it("applies a component override over global", () => {
    const d = resolveComponentDesign(global, { booking: { buttonRadius: "pill", fontPairing: "mono", buttonColor: "#ff0000" } }, "booking");
    expect(d.buttonRadius).toBe("rounded");
    expect(d.fontPairing).toBe("mono");
    expect(d.buttonColor).toBe("#ff0000");
    expect(d.buttonVariant).toBe("fill");
    expect(d.hasButtonOverride).toBe(true);
  });

  it("does not leak one component's override into another", () => {
    expect(resolveComponentDesign(global, { booking: { buttonRadius: "pill" } }, "links").buttonRadius).toBe("rounded");
  });

  it("drops invalid stored values", () => {
    expect(normalizeThemeOverrides({ links: { buttonRadius: "huge", buttonColor: "red", fontPairing: "serif" } })).toEqual({ links: { fontPairing: "serif" } });
  });

  it("marks a component with an override as unique style", () => {
    expect(hasUniqueStyle(global, { socials: { buttonVariant: "neon" } }, "socials")).toBe(true);
  });
});
