import { describe, expect, it } from "vitest";
import {
  CAPTION_BAND_RATIO,
  CAPTION_MAX_LENGTH,
  captionHref,
  captionSvg,
  prettyCaption,
  truncateCaption,
} from "./qr-caption";

describe("prettyCaption", () => {
  it("drops the protocol and trailing slash", () => {
    expect(prettyCaption("https://rout.be/s/abc123/")).toBe("rout.be/s/abc123");
  });

  it("handles empty input", () => {
    expect(prettyCaption("")).toBe("");
  });
});

describe("truncateCaption", () => {
  it("leaves short captions untouched", () => {
    expect(truncateCaption("rout.be/s/abc123")).toBe("rout.be/s/abc123");
  });

  it("shortens in the middle and never exceeds the maximum", () => {
    const long = `rout.be/s/${"a".repeat(60)}/zomercampagne`;
    const out = truncateCaption(long);
    expect(out.length).toBeLessThanOrEqual(CAPTION_MAX_LENGTH);
    expect(out).toContain("…");
    expect(out.startsWith("rout.be/s/")).toBe(true);
    expect(out.endsWith("campagne")).toBe(true);
  });
});

describe("captionHref", () => {
  it("keeps an absolute URL as-is", () => {
    expect(captionHref("https://bxl.li/s/abc")).toBe("https://bxl.li/s/abc");
  });

  it("upgrades a bare host to https", () => {
    expect(captionHref("rout.be/s/abc")).toBe("https://rout.be/s/abc");
  });

  it("returns null for text that is not a link", () => {
    expect(captionHref("scan mij")).toBeNull();
    expect(captionHref("")).toBeNull();
  });
});

describe("captionSvg", () => {
  it("adds a caption band below the QR and escapes the text", () => {
    const { svg, width, height } = captionSvg({
      qrHref: "data:image/png;base64,AAA",
      size: 1000,
      text: "rout.be/s/a&b",
      color: "#111111",
      bg: "#ffffff",
    });
    expect(width).toBe(1000);
    expect(height).toBe(1000 + Math.round(1000 * CAPTION_BAND_RATIO));
    expect(svg).toContain("rout.be/s/a&amp;b");
    expect(svg).toContain('fill="#ffffff"');
  });

  it("omits the paper rect when the background is transparent", () => {
    const { svg } = captionSvg({
      qrHref: "data:image/png;base64,AAA",
      size: 500,
      text: "rout.be/s/x",
      color: "#000",
      bg: "transparent",
    });
    expect(svg).not.toContain("<rect");
  });
});
