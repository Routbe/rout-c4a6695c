import { describe, expect, it } from "vitest";
import { hasProfilePro } from "./profile-entitlements";

describe("Pro-erfenis voor aliasprofielen", () => {
  it("volgt verificatie of Pro van de eigenaar", () => {
    expect(hasProfilePro({ verified: true })).toBe(true);
    expect(hasProfilePro({ is_paid: true })).toBe(true);
    expect(hasProfilePro({ tier: "pro" })).toBe(true);
    expect(hasProfilePro({ verified: false, is_paid: false })).toBe(false);
    expect(hasProfilePro({})).toBe(false);
  });
});
