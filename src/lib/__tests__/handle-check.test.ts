import { describe, expect, it } from "vitest";
import { handleRuleMessage } from "@/lib/handle-rules";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { hasValidDigitSuffix } from "@/lib/handle-suggestions";

describe("handle rules", () => {
  it("blocks reserved system slugs", () => {
    for (const s of ["iban-qr", "wifi-qr", "login", "settings", "about", "vcard-qr"])
      expect(isReservedSlug(s), s).toBe(true);
    expect(isReservedSlug("jona.delplanche48")).toBe(false);
  });
  it("free tier needs 5+ chars and 2 digits", () => {
    expect(handleRuleMessage("jona.delplanche48", { tier: "free" })).toBeNull();
    expect(handleRuleMessage("janedoe", { tier: "free" })).toBeTruthy();
    expect(handleRuleMessage("jona1", { tier: "free" })).toBeTruthy();
  });
  it("allows long digit suffixes but needs 3+ letters", () => {
    expect(hasValidDigitSuffix("jona48")).toBe(true);
    expect(hasValidDigitSuffix("jona12345")).toBe(true);
    expect(hasValidDigitSuffix("jo12345")).toBe(false);
    expect(handleRuleMessage("jo12345", { tier: "free" })).toBeTruthy();
    expect(handleRuleMessage("jona12345", { tier: "free" })).toBeNull();
  });
});
