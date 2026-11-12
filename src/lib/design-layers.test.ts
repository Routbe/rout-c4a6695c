import { describe, expect, it } from "vitest";
import { MAX_BACKGROUNDS, MAX_DECORATIONS, normalizeDesignLayers, safeImageUrl, profileHandleLabel, IDENTITY_PARTS } from "./design-layers";
import { normalizeLayersPref } from "./profile-display";

describe("design layers normalization", () => {
  it("bounds profile component widths to one or two columns", () => {
    const d = normalizeDesignLayers({ blockStyles: { a: { width: 2 }, b: { width: 900 } } });
    expect(d.blockStyles.a?.width).toBe(2);
    expect(d.blockStyles.b?.width).toBeUndefined();
  });
  it("keeps only auto, medium or tall component heights", () => {
    const d = normalizeDesignLayers({ blockStyles: { a: { height: "tall" }, b: { height: "9999px" } } });
    expect(d.blockStyles.a?.height).toBe("tall");
    expect(d.blockStyles.b?.height).toBeUndefined();
  });
  it("defaults identity to name, handle, location and bio", () => {
    expect(normalizeDesignLayers({}).identityOrder ?? IDENTITY_PARTS).toEqual(["name", "handle", "location", "bio"]);
  });
  it("preserves a chosen identity order, removes duplicates and appends missing fields", () => {
    expect(normalizeDesignLayers({ identityOrder: ["bio", "bio", "script", "handle"] }).identityOrder).toEqual(["bio", "handle", "name", "location"]);
  });
  it("keeps both link representations independent from the button shape", () => {
    expect(normalizeDesignLayers({ linkDisplay: "both" }).linkDisplay).toBe("both");
    expect(normalizeDesignLayers({ linkDisplay: "javascript" }).linkDisplay).toBeUndefined();
  });
  it("formats root handles without the site address", () => { expect(profileHandleLabel("/@alice")).toBe("@alice"); });
  it("keeps the alias namespace visible", () => { expect(profileHandleLabel("/u/alice")).toBe("@u/alice"); });
  it("keeps the workspace namespace visible", () => { expect(profileHandleLabel("/w/team")).toBe("@w/team"); });
  it("keeps every section exactly once", () => {
    const l = normalizeDesignLayers({ sections: [{ id: "footer", visible: false }, { id: "footer" }, { id: "bogus" }] });
    expect(l.sections.map((s) => s.id)).toEqual(["footer", "avatar", "blocks", "fx", "decorations"]);
    expect(l.sections[0]!.visible).toBe(false);
  });
  it("caps layer counts and clamps numbers", () => {
    const many = Array.from({ length: 50 }, () => ({ kind: "color", opacity: 900 }));
    const l = normalizeDesignLayers({ backgrounds: many, decorations: many });
    expect(l.backgrounds).toHaveLength(MAX_BACKGROUNDS);
    expect(l.decorations).toHaveLength(MAX_DECORATIONS);
    expect(l.backgrounds[0]!.opacity).toBe(100);
  });
  it("rejects non-https photos and bad colors", () => {
    expect(safeImageUrl("javascript:alert(1)")).toBe("");
    expect(safeImageUrl("http://x.be/a.jpg")).toBe("");
    const l = normalizeDesignLayers({ backgrounds: [{ kind: "photo", imageUrl: "data:x", color: "red" }] });
    expect(l.backgrounds[0]!.imageUrl).toBe("");
    expect(l.backgrounds[0]!.color).toBe("#f5efe6");
  });
  it("stores nothing for an empty design and survives broken JSON", () => {
    expect(normalizeLayersPref(JSON.stringify({ sections: [] }))).toBe("");
    expect(normalizeLayersPref("{not json")).toBe("");
  });
});
