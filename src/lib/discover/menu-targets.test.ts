import { describe, expect, it } from "vitest";
import { MENU_TARGETS, menuTarget, type MenuKey } from "./menu-targets";

const SIGN_IN_WALLED = ["/studio", "/agenda", "/batch", "/dashboard/routes", "/console"];

describe("header menu targets", () => {
  it("sends signed-in members to the working tool", () => {
    expect(menuTarget("studio", true)).toBe("/studio");
    expect(menuTarget("agenda", true)).toBe("/agenda");
    expect(menuTarget("api", true)).toBe("/console");
  });

  it("never sends signed-out visitors to a sign-in wall", () => {
    for (const key of Object.keys(MENU_TARGETS) as MenuKey[]) {
      const to = menuTarget(key, false);
      expect(SIGN_IN_WALLED.some((p) => to === p || to.startsWith(`${p}/`))).toBe(false);
    }
    expect(menuTarget("studio", false)).toBe("/discover/profiles");
    expect(menuTarget("api", false)).toBe("/discover/developers");
    expect(menuTarget("agenda", false)).toBe("/discover/bookings");
  });
});
