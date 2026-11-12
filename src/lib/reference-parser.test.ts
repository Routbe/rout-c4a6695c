import { describe, expect, it } from "vitest";
import { parseAllRoutReferences, parseRoutReference } from "./reference-parser";

describe("parseRoutReference", () => {
  it("extracts a plain reference", () => {
    expect(parseRoutReference("Payment ROUT-DEMO01 received")).toBe("ROUT-DEMO01");
  });

  it("is case-insensitive and upper-cases the result", () => {
    expect(parseRoutReference("ref: rout-ab12cd")).toBe("ROUT-AB12CD");
  });

  it("tolerates a space or missing dash between ROUT and the code", () => {
    expect(parseRoutReference("ROUT DEMO01")).toBe("ROUT-DEMO01");
    expect(parseRoutReference("ROUTDEMO01")).toBe("ROUT-DEMO01");
  });

  it("ignores surrounding punctuation and whitespace", () => {
    expect(parseRoutReference("Bank transfer\nRef: ROUT-XYZ123.\nThanks")).toBe("ROUT-XYZ123");
  });

  it("returns null when there is no reference", () => {
    expect(parseRoutReference("Jane Doe rent payment")).toBeNull();
  });

  it("returns null for empty or missing input", () => {
    expect(parseRoutReference("")).toBeNull();
    expect(parseRoutReference(null)).toBeNull();
    expect(parseRoutReference(undefined)).toBeNull();
  });

  it("does not match a code shorter than 4 characters", () => {
    expect(parseRoutReference("ROUT-AB")).toBeNull();
  });
});

describe("parseAllRoutReferences", () => {
  it("returns every distinct reference in a blob, de-duplicated", () => {
    expect(parseAllRoutReferences("ROUT-DEMO01 ... later ROUT-DEMO01 and ROUT-AB12CD")).toEqual([
      "ROUT-DEMO01",
      "ROUT-AB12CD",
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(parseAllRoutReferences("no codes here")).toEqual([]);
  });
});
