import { describe, expect, it } from "vitest";
import { OG_FORMATS, parseOgFormat } from "./og-formats";
import { ogSvg } from "./og-card";
import { shareCardPath, shareCardSvg } from "./og-action-card";
import { profilePreviewPath } from "./profile-preview";

const base = { handle: "anna", name: "Anna", tagline: "Fotograaf in Gent", bg: "#0d0d0d", accent: "#41DB97", avatarUrl: null };

describe("share image formats", () => {
  it("offers link preview, square, portrait and story at the platform sizes", () => {
    expect(OG_FORMATS.landscape).toMatchObject({ width: 1200, height: 630 });
    expect(OG_FORMATS.square).toMatchObject({ width: 1080, height: 1080 });
    expect(OG_FORMATS.portrait).toMatchObject({ width: 1080, height: 1350 });
    expect(OG_FORMATS.story).toMatchObject({ width: 1080, height: 1920 });
  });

  it("an unknown format falls back to the link preview", () => {
    expect(parseOgFormat("poster")).toBe("landscape");
    expect(parseOgFormat(null)).toBe("landscape");
    expect(parseOgFormat("story")).toBe("story");
  });

  it("the profile card is drawn at the size of each format", () => {
    expect(ogSvg(base, "story")).toContain('width="1080" height="1920" viewBox="0 0 1080 1920"');
    expect(ogSvg(base, "square")).toContain('width="1080" height="1080"');
    expect(ogSvg(base)).toContain('width="1200" height="630"');
  });

  it("link preview addresses stay unchanged; other formats add only a format parameter", () => {
    expect(profilePreviewPath("anna")).toBe("/api/public/og/anna.png");
    expect(profilePreviewPath("anna", "root", "png", "square")).toBe("/api/public/og/anna.png?format=square");
    expect(profilePreviewPath("anna", "alias", "png", "story")).toBe("/api/public/og/anna.png?space=alias&format=story");
    expect(shareCardPath("anna", "ask", "nl", "alias", "story")).toBe("/api/public/og/anna.png?card=ask&lang=nl&space=alias&format=story");
  });

  it("the story invitation stays between the top 250 px and bottom 340 px overlays", () => {
    const svg = shareCardSvg({ kind: "ask", lang: "nl", handle: "anna", name: "Anna", avatarUrl: null, urlLabel: "rout.be/anna/ask", format: "story" });
    const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/.exec(svg)!;
    const [ty, s] = [Number(m[2]), Number(m[3])];
    // The invitation occupies y 46..(46 + 250 + 120 + 26 + 116) in card units.
    const top = ty + 46 * s;
    const bottom = ty + (46 + 250 + 120 + 26 + 116) * s;
    expect(top).toBeGreaterThanOrEqual(250);
    expect(bottom).toBeLessThanOrEqual(1920 - 340);
  });

  it("the tall profile card keeps the avatar below the story's top overlay", () => {
    const svg = ogSvg(base, "story");
    const cy = Number(/<circle cx="540" cy="(\d+)" r="230"/.exec(svg)![1]);
    expect(cy - 230).toBeGreaterThanOrEqual(250);
  });
});
