import { describe, expect, it } from "vitest";
import { ALL_STICKERS, STICKER_CATEGORIES } from "./sticker-library";
import { normalizeDesignLayers } from "./design-layers";

describe("sticker library", () => {
  it("biedt minstens 100 unieke stickers in categorieën", () => {
    expect(new Set(ALL_STICKERS).size).toBeGreaterThanOrEqual(100);
    expect(STICKER_CATEGORIES.length).toBeGreaterThanOrEqual(5);
  });
  it("elke sticker overleeft de server-normalisatie", () => {
    for (const emoji of ALL_STICKERS) {
      const out = normalizeDesignLayers({ decorations: [{ id: "a", kind: "emoji", emoji }] });
      expect(out.decorations[0]?.emoji).toBe(emoji);
    }
  });
});
