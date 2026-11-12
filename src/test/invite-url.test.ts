import { describe, expect, it } from "vitest";
import { inviteMessage, inviteUrl } from "@/lib/invite";

describe("invite links", () => {
  it("verified members share rout.be/r/<handle>", () => {
    expect(inviteUrl("Jona.Delplanche", true)).toBe("https://rout.be/r/jona.delplanche");
  });
  it("free aliases share rout.be/r/u/<alias>", () => {
    expect(inviteUrl("@jona", false)).toBe("https://rout.be/r/u/jona");
  });
  it("uses the exact share text", () => {
    expect(inviteMessage("https://rout.be/r/jona.delplanche")).toBe(
      "Claim je soevereine digitale identiteit op ROUT via mijn uitnodiging: https://rout.be/r/jona.delplanche",
    );
  });
});

describe("invite link normalisation", async () => {
  const { normalizeReferralCode } = await import("@/lib/referral");
  it("free alias ref u_jona credits inviter jona", () => {
    expect(normalizeReferralCode("u_jona")).toBe("jona");
  });
});
