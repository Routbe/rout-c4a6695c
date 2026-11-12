import { describe, expect, it } from "vitest";
import { resolvePlatformFeatures, isPlatformFeatureId } from "./platform-features";
import { designButtonStyle, normalizeDesignPrefs } from "./profile-design";
import { applyScopedPatch, DEFAULT_GLASS } from "./theme-engine";

const theme = { bg: "#ffffff", card: "#f5f5f5", text: "#111111", border: "#dddddd", accent: "#3366ff" };

describe("platform feature switches", () => {
  it("every feature is on unless an admin explicitly switched it off", () => {
    const map = resolvePlatformFeatures([{ feature: "questions", enabled: false }, { feature: "unknown", enabled: false }]);
    expect(map.questions).toBe(false);
    expect(map.guestbook).toBe(true);
    expect(map.signup_block).toBe(true);
    expect(isPlatformFeatureId("unknown")).toBe(false);
  });
});

describe("button border colour (Knoprand)", () => {
  it("is off by default and overrides the border only when switched on", () => {
    const base = { ...normalizeDesignPrefs({}), buttonsCustom: true, buttonVariant: "fill" as const };
    expect(designButtonStyle(base, theme)?.["border"]).toBe("1px solid transparent");
    expect(designButtonStyle({ ...base, buttonBorderColor: "#ff0000" }, theme)?.["border"]).toBe("1px solid #ff0000");
    expect(designButtonStyle({ ...base, buttonVariant: "hard", buttonBorderColor: "#ff0000" }, theme)?.["border"]).toBe("2px solid #ff0000");
  });

  it("clearing a scoped colour removes the override instead of storing null", () => {
    const next = applyScopedPatch(DEFAULT_GLASS, { links: { buttonBorderColor: "#ff0000" } }, "links", { buttonBorderColor: null });
    expect(next.overrides.links).toEqual({});
  });
});
