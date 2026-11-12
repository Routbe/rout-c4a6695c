import { describe, expect, it } from "vitest";
import { DIDIT_MONTHLY_LIMIT, diditAvailable, effectiveDisplayName, monthKey, normalizeRealName } from "./identity-rules";

describe("identity rules", () => {
  it("disables Didit at the monthly limit", () => {
    expect(diditAvailable(DIDIT_MONTHLY_LIMIT - 1)).toBe(true);
    expect(diditAvailable(DIDIT_MONTHLY_LIMIT)).toBe(false);
    expect(diditAvailable(DIDIT_MONTHLY_LIMIT + 3)).toBe(false);
  });
  it("builds a UTC month key", () => {
    expect(monthKey(new Date(Date.UTC(2026, 9, 31, 23)))).toBe("2026-10-01");
  });
  it("locks the verified name over submitted names", () => {
    expect(effectiveDisplayName("Fake Name", "Jan Peeters")).toBe("Jan Peeters");
    expect(effectiveDisplayName("Jan", null)).toBe("Jan");
  });
  it("normalizes real names", () => {
    expect(normalizeRealName("  Jan   Peeters ")).toBe("Jan Peeters");
    expect(normalizeRealName("x")).toBeNull();
  });
});
