import { describe, expect, it } from "vitest";
import { bioClaimsMemberSince } from "./bio-rules";

describe("manual 'member since' in bio", () => {
  it("rejects typed member-since claims in every language", () => {
    for (const s of ["Lid sinds 2019", "lid sinds maart 2020", "Member since 2018", "Membre depuis 2021", "Mitglied seit 2017"]) {
      expect(bioClaimsMemberSince(s)).toBe(true);
    }
  });
  it("allows ordinary bios", () => {
    expect(bioClaimsMemberSince("Fotograaf sinds 2010 in Gent")).toBe(false);
    expect(bioClaimsMemberSince(null)).toBe(false);
  });
});
