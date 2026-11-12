import { describe, expect, it } from "vitest";
import {
  PARTIAL_NAME_THRESHOLD,
  STRONG_NAME_THRESHOLD,
  extractPayerName,
  levenshtein,
  matchPayerName,
  normalizeName,
} from "./sepa-name-match";

describe("normalizeName", () => {
  it("strips accents, punctuation, case and word order", () => {
    expect(normalizeName("Émile Van Der Berg")).toBe(normalizeName("berg emile"));
  });

  it("drops legal forms and courtesy titles", () => {
    expect(normalizeName("ROUT BV")).toBe("rout");
    expect(normalizeName("Dhr. Jan Jansen")).toBe(normalizeName("Jansen Jan"));
  });

  it("returns an empty string for nothing usable", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName("  ---  ")).toBe("");
  });
});

describe("levenshtein", () => {
  it("counts single edits", () => {
    expect(levenshtein("jansen", "janssen")).toBe(1);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("matchPayerName — strong (same person)", () => {
  const strong: Array<[string, string]> = [
    ["Jan Jansen", "Jan Jansen"],
    ["JAN JANSEN", "jan jansen"],
    ["Jansen, Jan", "Jan Jansen"],
    ["J. Jansen", "Jan Jansen"],
    ["Émile Dupont", "Emile Dupont"],
    ["Jan Janssen", "Jan Jansen"],
    ["Marie-Claire Dubois", "Marie Claire Dubois"],
  ];

  it.each(strong)("%s ≈ %s", (payer, holder) => {
    const result = matchPayerName(payer, holder);
    expect(result.score).toBeGreaterThanOrEqual(STRONG_NAME_THRESHOLD);
    expect(result.verdict).toBe("strong");
  });
});

describe("matchPayerName — partial (human review, level 2b)", () => {
  const partial: Array<[string, string]> = [
    ["Sofie Peeters", "Sofie Peeters-Maes"],
    ["Jan Jansen", "Jan Jansen Vermeulen Declerck"],
  ];

  it.each(partial)("%s ~ %s", (payer, holder) => {
    const result = matchPayerName(payer, holder);
    expect(result.verdict).toBe("partial");
    expect(result.score).toBeGreaterThanOrEqual(PARTIAL_NAME_THRESHOLD);
    expect(result.score).toBeLessThan(STRONG_NAME_THRESHOLD);
  });
});

describe("matchPayerName — weak (never auto-link)", () => {
  const weak: Array<[string | null, string | null]> = [
    ["Karel Vermeulen", "Jan Jansen"],
    ["Acme Trading", "Sofie Peeters"],
    [null, "Jan Jansen"],
    ["Jan Jansen", null],
    ["", "Jan Jansen"],
  ];

  it.each(weak)("%s ≠ %s", (payer, holder) => {
    expect(matchPayerName(payer, holder).verdict).toBe("weak");
  });
});

describe("extractPayerName", () => {
  it("reads the labelled counterparty from bank text", () => {
    expect(extractPayerName("Van: Jan Jansen\nMededeling: ROUT-AB12CD")).toBe("Jan Jansen");
    expect(extractPayerName("From: Sofie Peeters; EUR 15,99")).toBe("Sofie Peeters");
    expect(extractPayerName("Opdrachtgever : Émile Dupont")).toBe("Émile Dupont");
  });

  it("scrubs IBANs, amounts and references glued to the name", () => {
    expect(extractPayerName("Payer: Jan Jansen BE68539007547034 EUR 15,99")).toBe("Jan Jansen");
    expect(extractPayerName("Naam: Jan Jansen ROUT-AB12CD")).toBe("Jan Jansen");
  });

  it("returns null when there is no labelled name", () => {
    expect(extractPayerName("Overschrijving EUR 15,99 ROUT-AB12CD")).toBeNull();
    expect(extractPayerName("Van: 12")).toBeNull();
    expect(extractPayerName(null)).toBeNull();
  });
});
