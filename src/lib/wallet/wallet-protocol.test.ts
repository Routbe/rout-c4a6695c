import { describe, expect, it } from "vitest";
import { pairingTransition } from "./card-pairing";
import { generateMRZ_TD1, isStrictTd1, verifyMrz } from "./card-mrz";
import { createLocalizedString } from "./wallet-i18n";

describe("uploaded card protocol rules", () => {
  it("recovers from removing an NFC card before it can be read", () => {
    const scanning = pairingTransition("idle", "scan");
    expect(scanning).toBe("scanning");
    const error = pairingTransition(scanning, "fail");
    expect(error).toBe("error");
    expect(pairingTransition(error, "scan")).toBe("scanning");
  });
  it("reserves success for server-confirmed pairing, not detection", () => {
    expect(pairingTransition("scanning", "detected")).toBe("idle");
    expect(pairingTransition("scanning", "verified")).toBe("scanning");
    expect(pairingTransition("verifying", "verified")).toBe("success");
  });
  it("cancels scanning and prevents starting a scan during verification", () => {
    expect(pairingTransition("scanning", "cancel")).toBe("idle");
    expect(pairingTransition("verifying", "scan")).toBe("verifying");
  });
  it("strictly rejects lowercase, whitespace and extra MRZ lines", () => {
    const lines = generateMRZ_TD1({ sovereignId: "RT-89K4-99X2-P", handle: "lena", space: "root" });
    expect(isStrictTd1(lines)).toBe(true);
    expect(verifyMrz([lines[0].toLowerCase(), lines[1], lines[2]]).ok).toBe(false);
    expect(isStrictTd1([` ${lines[0]}`, lines[1], lines[2]])).toBe(false);
    expect(isStrictTd1([...lines, lines[0]])).toBe(false);
  });
  it("nests exactly NL, EN, FR and DE with one default and three translations", () => {
    const result = createLocalizedString({ nl: "nl-value", en: "en-value", fr: "fr-value", de: "de-value" });
    expect(result.defaultValue).toEqual({ language: "en", value: "en-value" });
    expect(result.translatedValues).toEqual([{ language: "nl", value: "nl-value" }, { language: "fr", value: "fr-value" }, { language: "de", value: "de-value" }]);
  });
});