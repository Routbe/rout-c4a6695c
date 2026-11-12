import { describe, expect, it } from "vitest";
import { buildExportFilename, extensionFor, slugify } from "./export-filename";

describe("slugify", () => {
  it("strips accents and punctuation, expands &", () => {
    expect(slugify("Café & QR-Code!")).toBe("cafe-and-qr-code");
  });

  it("collapses consecutive spaces and symbols", () => {
    expect(slugify("  my   ***  preset  ")).toBe("my-preset");
  });

  it("falls back to rout-export on empty or symbol-only input", () => {
    expect(slugify("")).toBe("rout-export");
    expect(slugify("   ")).toBe("rout-export");
    expect(slugify("!!!///")).toBe("rout-export");
  });

  it("honours a custom fallback", () => {
    expect(slugify("", "qr")).toBe("qr");
  });

  it("truncates very long titles without trailing separators", () => {
    const long = "A ".repeat(80) + "very long preset title indeed";
    const out = slugify(long);
    expect(out.length).toBeLessThanOrEqual(48);
    expect(out.endsWith("-")).toBe(false);
    expect(out.startsWith("-")).toBe(false);
  });

  it("keeps unicode letters transliterable to ascii only", () => {
    expect(slugify("Ürsula Ømega — Ñandú")).toBe("ursula-omega-nandu");
  });
});

describe("extensionFor", () => {
  it("normalises jpeg variants and defaults to png", () => {
    expect(extensionFor("jpeg")).toBe("jpg");
    expect(extensionFor("JPG")).toBe("jpg");
    expect(extensionFor("svg")).toBe("svg");
    expect(extensionFor("webp")).toBe("png");
  });
});

describe("buildExportFilename", () => {
  const date = new Date(2026, 7, 6, 13, 45, 2);

  it("builds the canonical schema", () => {
    expect(buildExportFilename({ preset: "Midnight", format: "png", date })).toBe(
      "rout-midnight-png-20260806-134502.png",
    );
  });

  it("never duplicates the rout prefix", () => {
    expect(buildExportFilename({ preset: "rout-paper", format: "svg", date })).toBe(
      "rout-paper-svg-20260806-134502.svg",
    );
  });

  it("keeps the extension intact for long presets", () => {
    const name = buildExportFilename({
      preset: "An extremely long preset title that should be truncated cleanly",
      format: "jpeg",
      date,
    });
    expect(name.endsWith(".jpg")).toBe(true);
    expect(name).not.toContain("--");
  });
});
