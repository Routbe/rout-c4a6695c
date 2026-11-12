import { describe, expect, it } from "vitest";
import { badgeAfterConversion, canExecute, checkTarget, daysLeft, readConversionDetails, statusAfter, sunsetDate, SUNSET_MEMBER_ROLE } from "./workspace-conversion-rules";

const now = new Date("2026-10-28T10:00:00Z");
const open = { status: "otp_ok" as const, otpVerifiedAt: "x", acceptedAt: null, targetUserId: "t", expiresAt: "2026-11-01T00:00:00Z" };

describe("workspace conversion", () => {
  it("sunset is 30 days later", () => {
    expect(sunsetDate(now).toISOString()).toBe("2026-11-27T10:00:00.000Z");
  });
  it("needs both the code and owner acceptance", () => {
    expect(canExecute(open, now)).toBe(false);
    expect(canExecute({ ...open, acceptedAt: "y", otpVerifiedAt: null }, now)).toBe(false);
    expect(canExecute({ ...open, acceptedAt: "y" }, now)).toBe(true);
  });
  it("runs only once", () => {
    expect(canExecute({ ...open, acceptedAt: "y", status: "completed" }, now)).toBe(false);
  });
  it("refuses expired transfers", () => {
    expect(canExecute({ ...open, acceptedAt: "y", expiresAt: "2026-10-27T00:00:00Z" }, now)).toBe(false);
  });
  it("status becomes accepted only with both consents", () => {
    expect(statusAfter({ otpVerifiedAt: "x", acceptedAt: null })).toBe("otp_ok");
    expect(statusAfter({ otpVerifiedAt: "x", acceptedAt: "y" })).toBe("accepted");
  });
  it("owner must be another account", () => {
    expect(checkTarget("a", "Me@x.be", { email: "me@x.be" })).toBe("same_account");
    expect(checkTarget("a", "me@x.be", { userId: "a" })).toBe("same_account");
    expect(checkTarget("a", "me@x.be", { email: "other@x.be" })).toBeNull();
  });
  it("blue badge is stripped", () => {
    expect(badgeAfterConversion("blue")).toBe("none");
  });
  it("the old login keeps working 30 days as workspace admin", () => {
    expect(SUNSET_MEMBER_ROLE).toBe("admin");
    expect(daysLeft(sunsetDate(now).toISOString(), now)).toBe(30);
    expect(daysLeft("2026-10-01T00:00:00Z", now)).toBe(0);
  });
  it("wizard answers are re-validated; invalid ones fall back to safe defaults", () => {
    const d = readConversionDetails({ category: "agency", invites: [{ target: "@lisa", role: "admin" }], plan_id: "tier_pro", billing_cycle: "yearly" });
    expect(d.category).toBe("agency");
    expect(d.invites).toHaveLength(1);
    expect(d.plan_id).toBe("tier_pro");
    const bad = readConversionDetails({ invites: [{ target: "@lisa", role: "owner" }] });
    expect(bad.invites).toEqual([]);
    expect(bad.plan_id).toBe("tier_starter");
  });
});
