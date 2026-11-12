import { describe, expect, it } from "vitest";
import { pickConversionDesign, suggestedConversionSlug } from "./workspace-conversion-rules";

const V = { payload: { displayName: "Verified" }, published: true };
const A = { payload: { displayName: "Alias" }, published: true };

describe("conversion design", () => {
  it("verified design goes live, alias design is kept as concept", () => {
    expect(pickConversionDesign({ verified: true, verifiedDraft: V, aliasDraft: A })).toEqual({ live: V.payload, concept: A.payload });
  });
  it("unverified account carries the alias design", () => {
    expect(pickConversionDesign({ verified: false, verifiedDraft: V, aliasDraft: A }).live).toEqual(A.payload);
  });
  it("an unpublished design is never made live", () => {
    expect(pickConversionDesign({ verified: true, verifiedDraft: { ...V, published: false }, aliasDraft: null })).toEqual({ live: null, concept: V.payload });
  });
  it("no designs → nothing", () => {
    expect(pickConversionDesign({ verified: true, verifiedDraft: null, aliasDraft: null })).toEqual({ live: null, concept: null });
  });
});

describe("suggested slug", () => {
  it("keeps the old username, dots become dashes", () => {
    expect(suggestedConversionSlug("maximilien.brussels", "Maximilien")).toBe("maximilien-brussels");
  });
});
