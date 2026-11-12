import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLASS, DEFAULT_GLASS_TARGETS, applyScopedPatch, glassSurfaceStyle, hasUniqueStyle,
  normalizeGlassTokens, resetScope, resolveScopedTokens, scopeOfBlockKind, resolveComponentDesign,
} from "@/lib/theme-engine";

describe("scoped theme engine", () => {
  it("never applies pill shape to interactive widgets", () => {
    expect(resolveComponentDesign({ buttonRadius: "pill" }, {}, "questions").buttonRadius).toBe("rounded");
    expect(resolveComponentDesign({ buttonRadius: "pill" }, {}, "links").buttonRadius).toBe("pill");
  });
  it("widget overrides do not change link styles", () => {
    const overrides = { widgets: { buttonColor: "#123456" } };
    expect(resolveComponentDesign({}, overrides, "questions").buttonColor).toBe("#123456");
    expect(resolveComponentDesign({}, overrides, "links").buttonColor).toBeUndefined();
  });
  it("'Alle elementen' changes the global tokens, not overrides", () => {
    const r = applyScopedPatch(DEFAULT_GLASS, {}, "all", { glassStyle: "prism" });
    expect(r.global.glassStyle).toBe("prism");
    expect(r.overrides).toEqual({});
  });
  it("a component scope stores its own override and shows as unique until reset", () => {
    const r = applyScopedPatch(DEFAULT_GLASS, {}, "booking", { glassStyle: "obsidian" });
    expect(r.overrides.booking).toEqual({ glassStyle: "obsidian" });
    expect(resolveScopedTokens(r.global, r.overrides, "booking").glassStyle).toBe("obsidian");
    expect(resolveScopedTokens(r.global, r.overrides, "links").glassStyle).toBe("solid");
    expect(hasUniqueStyle(r.global, r.overrides, "booking")).toBe(true);
    expect(hasUniqueStyle(r.global, resetScope(r.overrides, "booking"), "booking")).toBe(false);
  });
  it("clamps opacity to 5–50% and blur to 4–32px", () => {
    const t = normalizeGlassTokens({ glassOpacity: 90, glassBlur: 1 });
    expect(t.glassOpacity).toBe(50);
    expect(t.glassBlur).toBe(4);
  });
  it("renders blur + GPU hint for glass and nothing for solid or unchecked targets", () => {
    const glass = { ...DEFAULT_GLASS, glassStyle: "frosted-light" as const, glassBlur: 16 };
    const css = glassSurfaceStyle(glass, "links", DEFAULT_GLASS_TARGETS)!;
    expect(css["backdropFilter"]).toBe("blur(16px) saturate(180%)");
    expect(css["willChange"]).toBe("transform");
    expect(glassSurfaceStyle(DEFAULT_GLASS, "links", DEFAULT_GLASS_TARGETS)).toBeNull();
    expect(glassSurfaceStyle(glass, "booking", { ...DEFAULT_GLASS_TARGETS, booking: false })).toBeNull();
  });
  it("maps block kinds to scopes", () => {
    expect(scopeOfBlockKind("booking_request")).toBe("booking");
    expect(scopeOfBlockKind("widget:guestbook")).toBe("board");
    expect(scopeOfBlockKind("live")).toBe("presence");
    expect(scopeOfBlockKind("social_feed")).toBe("socials");
    expect(scopeOfBlockKind("link")).toBe("links");
  });
});

import { liquidFilterId as _lfid, normalizeGlassTokens as _ngt, glassSurfaceStyle as _gss, DEFAULT_GLASS as _DG } from "@/lib/theme-engine";
describe("liquid glass tokens", () => {
  it("clamps the new sliders", () => {
    const t = _ngt({ glassSaturation: 500, glassRefraction: -4, glassAberration: 99, glassSpecular: 50 });
    expect(t.glassSaturation).toBe(200);
    expect(t.glassRefraction).toBe(0);
    expect(t.glassAberration).toBe(50);
  });
  it("no lens filter when refraction and aberration are zero", () => {
    expect(_lfid({ glassRefraction: 0, glassAberration: 0 })).toBeNull();
    expect(_lfid({ glassRefraction: 42, glassAberration: 18 })).toBe("rout-lg-r40-a20");
  });
  it("uses the Apple shadow, saturation and 0.4s easing", () => {
    const s = _gss({ ..._DG, glassStyle: "frosted-light", glassBlur: 20, glassSaturation: 180 }, "links", { links: true, presence: true, board: true, booking: true })!;
    expect(s.backdropFilter).toBe("blur(20px) saturate(180%)");
    expect(s.boxShadow).toContain("0 8px 32px 0 rgba(0, 0, 0, 0.15)");
    expect(s.transition).toBe("all 0.4s cubic-bezier(0.16, 1, 0.3, 1)");
  });
});
