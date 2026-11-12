import { describe, expect, it } from "vitest";
import { normalizeQrSettings } from "./qr-settings";
import { normalizeDisplayPrefs } from "./profile-display";
import { toProfileQrStyle } from "./qr-design-bridge";
import { themePresets } from "@/components/ThemePresets";
import { qrBackgroundSvg } from "./qr-background";

describe("normalizeQrSettings", () => {
  it("returns null for missing or empty", () => {
    expect(normalizeQrSettings(undefined)).toBeNull();
    expect(normalizeQrSettings({})).toBeNull();
  });
  it("falls back to #1A1A1A / #FFFFFF for invalid colors", () => {
    const s = normalizeQrSettings({ fgColor: "red", bgColor: "url(x)", cornerStyle: "dots", emblem: false });
    expect(s).toEqual({ fgColor: "#1A1A1A", bgColor: "#FFFFFF", cornerStyle: "dots", emblem: false });
  });
  it("rejects unknown corner styles", () => {
    expect(normalizeQrSettings({ cornerStyle: "hexagon" })?.cornerStyle).toBe("square");
  });
  it("survives display prefs normalization", () => {
    const p = normalizeDisplayPrefs({ qrSettings: { fgColor: "#112233", bgColor: "#ffffff", cornerStyle: "smooth", emblem: true } });
    expect(p.qrSettings?.fgColor).toBe("#112233");
  });
  it("preserves every layered designer fill through save and public profile normalization", () => {
    for (const theme of themePresets) {
      const saved = toProfileQrStyle({ ...theme, dotStyle: theme.shape });
      const read = normalizeDisplayPrefs({ qrSettings: saved }).qrSettings;
      expect(read?.bgColor).toBe(theme.bgColor);
      expect(read?.bgGradient ?? null).toBe(theme.bgGradient ?? null);
      if (theme.bgGradient) expect(qrBackgroundSvg(read?.bgColor ?? "", read?.bgGradient)).toContain("linearGradient");
    }
  });
  it("keeps selected logo settings and granular shapes without inventing an emblem", () => {
    const saved = toProfileQrStyle({ fgColor: "#112233", bgColor: "transparent", dotStyle: "classy", outerCornerStyle: "extra-rounded", innerCornerStyle: "dot", logo: "data:image/png;base64,AAAA", logoSize: 0.3, logoMargin: 12, hideBackgroundDots: false });
    expect(normalizeDisplayPrefs({ qrSettings: saved }).qrSettings).toMatchObject({ bgColor: "transparent", dotStyle: "classy", outerCornerStyle: "extra-rounded", innerCornerStyle: "dot", logoSize: 0.3, logoMargin: 12, hideBackgroundDots: false, emblem: false });
  });
  it("rejects image URLs or injected markup in backgrounds", () => {
    expect(normalizeQrSettings({ bgGradient: "url(https://evil.example/a)" })?.bgGradient).toBeUndefined();
    expect(normalizeQrSettings({ bgGradient: 'linear-gradient(#fff,#000)\"><script>' })?.bgGradient).toBeUndefined();
  });
});
