import { describe, expect, it } from "vitest";
import { cardMrz, generateMRZ_TD1, mrzCheckDigit, verifyMrz } from "./card-mrz";

const lines = cardMrz({ sovereignId: "RT-89K4-99X2-P", handle: "Léna.dev", space: "root", holderHash: "7KQ2XM", expiry: new Date("2036-11-03T00:00:00Z") });

describe("card MRZ", () => {
  it("keeps TD1 document and optional-field positions, not a 15-character document field", () => {
    expect(lines[0]?.slice(0, 5)).toBe("I<RTB");
    expect(lines[0]?.slice(15)).toHaveLength(15);
    expect(lines[1]?.slice(15, 18)).toBe("RTB");
  });
  it("supports explicit transliterated display names without fetching legal identity", () => {
    const named = generateMRZ_TD1({ sovereignId: "RT-89K4-99X2-P", handle: "lena", space: "root", surname: "Dèv", givenNames: "Léna" });
    expect(named[2]).toBe("DEV<<LENA<<<<<<<<<<<<<<<<<<<<<");
  });
  it("uses the ICAO 7-3-1 check digit", () => {
    // ICAO 9303 specimen document number.
    expect(mrzCheckDigit("L898902C3")).toBe(6);
  });

  it("is three lines of exactly 30 MRZ characters, no spaces or lower case", () => {
    expect(lines).toHaveLength(3);
    lines.forEach((l) => expect(l).toMatch(/^[A-Z0-9<]{30}$/));
    expect(lines[0]!.slice(5, 14)).toBe("89K499X2P");
    expect(lines[2]).toContain("LENA<DEV");
  });

  it("verifies its own check digits offline", () => {
    expect(verifyMrz(lines)).toEqual({ ok: true, documentNumber: "89K499X2P", issuer: "RTB", expiry: "361103" });
  });

  it("rejects a changed document number", () => {
    const bad = [lines[0]!.slice(0, 5) + "9" + lines[0]!.slice(6), lines[1]!, lines[2]!];
    expect(verifyMrz(bad)).toEqual({ ok: false, reason: "document" });
  });

  it("rejects a changed expiry date", () => {
    const l2 = lines[1]!;
    expect(verifyMrz([lines[0]!, l2.slice(0, 9) + (l2[9] === "7" ? "8" : "7") + l2.slice(10), lines[2]!]).ok).toBe(false);
  });

  it("never encodes a birth date or sex", () => {
    expect(lines[1]![7]).toBe("<");
  });
});
