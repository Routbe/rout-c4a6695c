import { describe, expect, it } from "vitest";
import { canGeneratePhrase, kitFileName, numberedWords, phraseConfirmed } from "./vault-rules";

const PHRASE = Array.from({ length: 24 }, (_, i) => `w${i + 1}`).join(" ");

describe("recovery phrase rules", () => {
  it("only generates a new phrase on a device without a Master Key and without a vault", () => {
    expect(canGeneratePhrase({ deviceHasKey: false, hasVault: false })).toBe(true);
    expect(canGeneratePhrase({ deviceHasKey: true, hasVault: false })).toBe(false);
    expect(canGeneratePhrase({ deviceHasKey: false, hasVault: true })).toBe(false);
    expect(canGeneratePhrase({ deviceHasKey: null, hasVault: false })).toBe(false);
  });

  it("requires the phrase to be copied, downloaded or printed before it can be confirmed", () => {
    expect(phraseConfirmed({ secured: false, ticked: true })).toBe(false);
    expect(phraseConfirmed({ secured: true, ticked: true })).toBe(true);
  });

  it("numbers exactly 24 words", () => {
    expect(numberedWords(PHRASE)?.[23]).toEqual({ n: 24, word: "w24" });
    expect(numberedWords("one two three")).toBeNull();
  });

  it("names the kit file by date only", () => {
    expect(kitFileName("phrase", new Date("2026-11-11T10:00:00Z"), "pdf")).toBe("rout-herstelwoorden-2026-11-11.pdf");
  });
});
