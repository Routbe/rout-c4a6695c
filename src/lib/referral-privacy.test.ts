import { beforeEach, describe, expect, it } from "vitest";
import { captureReferralFromUrl, clearReferrer, readReferrer, storeReferrer } from "./referral";

beforeEach(() => clearReferrer());
describe("nonpersistent referral attribution", () => {
  it("never sets a tracking cookie or persistent visitor identifier", () => {
    captureReferralFromUrl("?ref=alice");
    expect(readReferrer()).toBe("alice");
    expect(window.localStorage.getItem("rout_invited_by")).toBeNull();
    expect(document.cookie.includes("rout_invited_by=")).toBe(false);
  });
  it("keeps first inviter only for this page lifetime", () => {
    storeReferrer("alice"); storeReferrer("bob");
    expect(readReferrer()).toBe("alice");
    clearReferrer();
    expect(readReferrer()).toBeNull();
  });
});