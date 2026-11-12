import { describe, expect, it } from "vitest";
import { titleTypographyStyle, titleTypographyClass, type TitleTypography } from "./title-typography";
import { normalizeDesignPrefs } from "./profile-design";

const base: TitleTypography = { titleColor: null, titleGradientTo: null, titleGlow: 0, titleShadowBlur: 0, titleShadowX: 0, titleShadowY: 0, titleShadowColor: null, titleEffect: "none", titleEntrance: "none", titleReveal: 100 };

describe("title typography", () => {
  it("gradient uses start and end colour as clipped text", () => {
    const s = titleTypographyStyle({ ...base, titleColor: "#ff0000", titleGradientTo: "#0000ff" }, "#fff");
    expect(s.backgroundImage).toBe("linear-gradient(100deg, #ff0000, #0000ff)");
    expect(s.color).toBe("transparent");
  });
  it("shadow uses x, y, blur and colour", () => {
    const s = titleTypographyStyle({ ...base, titleShadowBlur: 8, titleShadowX: 3, titleShadowY: -2, titleShadowColor: "#112233" }, "#fff");
    expect(s.textShadow).toBe("3px -2px 8px #112233");
  });
  it("standard effect adds no classes", () => {
    expect(titleTypographyClass(base)).toBe("");
    expect(titleTypographyClass({ titleEffect: "fire", titleEntrance: "burn" })).toBe("tt-fx tt-fx-fire tt-in-burn");
  });
  it("normalizer clamps and rejects unknown effects", () => {
    const d = normalizeDesignPrefs({ titleShadowX: 99, titleEffect: "lava", titleReveal: -5 });
    expect(d.titleShadowX).toBe(20);
    expect(d.titleEffect).toBe("none");
    expect(d.titleReveal).toBe(0);
  });
});
