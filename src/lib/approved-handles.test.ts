import { describe, expect, it } from "vitest";
import { canClaim, personHandleBase, pickApproved } from "./approved-handles";
import { verifiedTabUnlocked } from "./studio-access";

describe("approved handle whitelist", () => {
  it("keeps only names the user proposed", () => {
    expect(pickApproved(["jona", "Jona.be", "jj"], ["JONA", "hacker", "jj"])).toEqual(["jona", "jj"]);
  });
  it("claims only approved, once", () => {
    expect(canClaim([{ handle: "jona", status: "approved" }], "Jona")).toBe(true);
    expect(canClaim([{ handle: "jona", status: "approved" }], "other")).toBe(false);
    expect(canClaim([{ handle: "jona", status: "void" }], "jona")).toBe(false);
    expect(canClaim([{ handle: "a", status: "claimed" }, { handle: "b", status: "approved" }], "b")).toBe(false);
  });
  it("person handle base", () => expect(personHandleBase("Zoë", "De Smet")).toBe("zoedesmet"));
});

describe("studio verified tab", () => {
  it("locked when not verified or inactive", () => {
    expect(verifiedTabUnlocked(null)).toBe(false);
    expect(verifiedTabUnlocked({ verified: false, status: "active" })).toBe(false);
    expect(verifiedTabUnlocked({ verified: true, status: "pending" })).toBe(false);
  });
  it("unlocked when verified and active or paid", () => {
    expect(verifiedTabUnlocked({ verified: true, status: "active" })).toBe(true);
    expect(verifiedTabUnlocked({ verified: true, status: "pending", isPaid: true })).toBe(true);
  });
});
