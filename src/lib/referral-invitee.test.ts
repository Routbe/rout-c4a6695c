import { describe, expect, it } from "vitest";
import { INVITEE_PERCENT_OFF, inviteePriceCents } from "./referral-rewards";

describe("invitee discount", () => {
  it("is 10 percent", () => expect(INVITEE_PERCENT_OFF).toBe(10));
  it("invited member pays 10% less", () => expect(inviteePriceCents(2000, true)).toBe(1800));
  it("not referred (self-invite or unknown handle never sets referred) pays full price", () =>
    expect(inviteePriceCents(2000, false)).toBe(2000));
});
