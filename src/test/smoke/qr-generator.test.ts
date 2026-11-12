/**
 * Smoke tests for the QR pipeline: encoding a payload must produce a scannable
 * matrix, and the studio's structure/validation helpers must agree with it.
 */
import { describe, expect, it } from "vitest";
import qrcode from "qrcode-generator";
import { zoneOf, isFinderZone, isTimingZone, isCustomStyle } from "@/lib/qr-structure";
import { checkUrl, normalizeUrlInput } from "@/lib/url-validation";

function encode(payload: string) {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  return qr;
}

describe("qr encoding", () => {
  it("encodes a URL into a square module matrix", () => {
    const qr = encode("https://rout.be/s/abc1234");
    const count = qr.getModuleCount();
    expect(count).toBeGreaterThanOrEqual(21);
    expect(count % 2).toBe(1);
    // Dark modules exist and the top-left finder pattern is present.
    expect(qr.isDark(0, 0)).toBe(true);
    expect(qr.isDark(3, 3)).toBe(true);
  });

  it("scales up for longer payloads", () => {
    const small = encode("https://rout.be/s/abc").getModuleCount();
    const large = encode(`https://rout.be/s/${"x".repeat(300)}`).getModuleCount();
    expect(large).toBeGreaterThan(small);
  });

  it("encodes every supported payload flavour without throwing", () => {
    const payloads = [
      "https://rout.be",
      "mailto:hallo@rout.be",
      "tel:+3212345678",
      "WIFI:T:WPA;S:rout;P:secret;;",
      "BEGIN:VCARD\nVERSION:3.0\nFN:ROUT\nEND:VCARD",
      "Bonjour, ça va? — ünïcode ✓",
    ];
    for (const payload of payloads) {
      expect(() => encode(payload).getModuleCount()).not.toThrow();
    }
  });
});

describe("matrix zones", () => {
  it("classifies finder, timing and data modules", () => {
    const count = encode("https://rout.be").getModuleCount();
    expect(isFinderZone(0, 0, count)).toBe(true);
    expect(isFinderZone(count - 1, count - 1, count)).toBe(false);
    expect(isTimingZone(6, 10)).toBe(true);
    expect(zoneOf(6, 10, count)).toBe("timing");
    expect(zoneOf(Math.floor(count / 2), Math.floor(count / 2), count)).toBe("data");
  });

  it("only accepts known custom styles", () => {
    expect(isCustomStyle("mesh")).toBe(true);
    expect(isCustomStyle("not-a-style")).toBe(false);
  });
});

describe("url input", () => {
  it("normalizes and validates studio input", () => {
    expect(normalizeUrlInput(" rout.be ")).toContain("rout.be");
    expect(checkUrl("").status).toBe("empty");
    expect(checkUrl("https://rout.be").status).toBe("valid");
  });
});
