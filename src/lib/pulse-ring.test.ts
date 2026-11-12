import { describe, expect, it } from "vitest";
import { parseDisplayPrefs } from "@/lib/profile-display";

describe("Live Presence Pulse ring", () => {
  it("is on by default for existing profiles", () => {
    expect(parseDisplayPrefs({}).pulseRing).toBe(true);
  });
  it("stays off once the member turns it off", () => {
    expect(parseDisplayPrefs({ pulseRing: false }).pulseRing).toBe(false);
  });
});
