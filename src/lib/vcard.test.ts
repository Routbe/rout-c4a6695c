import { describe, expect, it } from "vitest";
import { buildVCard, parseVCardConfig } from "./vcard";

const base = { handle: "jona", displayName: "Jona Test", profileUrl: "https://rout.be/jona" };

describe("vCard component", () => {
  it("writes job title, categorized phones and address, never a birthday", () => {
    const v = buildVCard({
      ...base,
      title: "Founder",
      phones: [{ type: "work", number: "+32 2 000 00 00" }, { type: "cell", number: "+32 470 00 00 00" }, { type: "home", number: "011" }],
      address: "Grote Markt 1, Brussel",
    });
    expect(v).toContain("TITLE:Founder");
    expect(v).toContain("TEL;TYPE=WORK:+32 2 000 00 00");
    expect(v).toContain("TEL;TYPE=CELL:+32 470 00 00 00");
    expect(v).toContain("TEL;TYPE=HOME:011");
    expect(v).toContain("ADR;TYPE=WORK:;;Grote Markt 1\\, Brussel;;;;");
    expect(v).not.toContain("BDAY");
  });
  it("uses the custom note over the bio", () => {
    expect(buildVCard({ ...base, note: "Met via ROUT", bio: "bio" })).toContain("NOTE:Met via ROUT");
  });
  it("defaults the URL to the ROUT profile and rejects non-http overrides", () => {
    expect(buildVCard(base)).toContain("URL:https://rout.be/jona");
    expect(parseVCardConfig(JSON.stringify({ urlOverride: "javascript:alert(1)" })).urlOverride).toBe("");
  });
  it("parses garbage safely", () => {
    expect(parseVCardConfig("not json").phones).toEqual([]);
    expect("birthday" in parseVCardConfig(JSON.stringify({ birthday: "1990-05-04" }))).toBe(false);
  });
});
