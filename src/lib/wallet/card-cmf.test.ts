import { describe, expect, it } from "vitest";
import { buildCmf, CARD_MATERIALS, materialsFor, nearestSafeAccent } from "./card-cmf";
import { contrastRatio } from "./card-style";
import { checkCardText } from "./card-privacy";

const input = { materialId: "obsidian-titanium", accentHex: "#f4f1ea", displayName: "Léna Dev", region: "Brussel, BE" };

describe("CMF engine", () => {
  it("offers the four sovereign materials to adults", () => {
    const ids = materialsFor("sovereign").map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["obsidian-titanium", "frosted-alpine-glass", "emerald-ceramic", "brushed-sovereign-silver"]));
  });
  it("gives minors only holographic materials", () => {
    expect(materialsFor("minor").every((m) => m.finish === "holo")).toBe(true);
    expect(buildCmf(input, "minor")).toEqual({ ok: false, error: "material" });
  });
  it("stores material values as data, not CSS", () => {
    const r = buildCmf(input, "sovereign");
    expect(r.ok && r.cmf.material).toMatchObject({ metalness: 0.92, roughness: 0.45, baseHex: "#2b2d31" });
  });
  it("refuses accents under 4.5:1", () => {
    expect(buildCmf({ ...input, accentHex: "#3a3c40" }, "sovereign")).toEqual({ ok: false, error: "contrast" });
  });
  it("snaps to the nearest readable tint", () => {
    for (const m of CARD_MATERIALS) {
      const safe = nearestSafeAccent("#777777", m.baseHex);
      expect(contrastRatio(safe, m.baseHex)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("privacy bot", () => {
  it.each([
    ["lena@example.com", "email"],
    ["+32 470 12 34 56", "phone"],
    ["0470/12.34.56", "phone"],
    ["85.07.30-033.28", "national-id"],
    ["03/11/1990", "birth-date"],
    ["EH1234567", "passport"],
  ])("blocks %s", (text, hit) => {
    expect(checkCardText(text)).toBe(hit);
  });
  it("allows a normal name and region", () => {
    expect(checkCardText("Léna Dev")).toBeNull();
    expect(checkCardText("Brussel, BE")).toBeNull();
  });
});
