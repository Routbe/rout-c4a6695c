import { describe, expect, it } from "vitest";
import { CARD_UNLOCK_TTL_S, cardActionAllowed, cardUnlockExpiry, cardUnlockPayload, checkCardUnlockPayload, generationLabel, needsStepUp } from "./card-lifecycle";
import { allowedStepUpMethods, hasSecondFactor, methodAcceptedFor } from "@/lib/auth/step-up-rules";

describe("ROUT card lifecycle", () => {
  it("freezing is instant and needs no re-verification, even without 2FA", () => {
    expect(needsStepUp("freeze")).toBe(false);
    expect(cardActionAllowed("freeze", "active", false)).toBe(true);
  });
  it("every other action needs a fresh verification", () => {
    for (const a of ["unfreeze", "block", "replace", "reveal", "claim"] as const) expect(needsStepUp(a)).toBe(true);
  });
  it("claiming or showing the private card needs active 2FA", () => {
    expect(cardActionAllowed("claim", "active", false)).toBe(false);
    expect(cardActionAllowed("reveal", "active", false)).toBe(false);
    expect(cardActionAllowed("claim", "active", true)).toBe(true);
  });
  it("a blocked card can never be unfrozen, only replaced", () => {
    expect(cardActionAllowed("unfreeze", "blocked", true)).toBe(false);
    expect(cardActionAllowed("block", "blocked", true)).toBe(false);
    expect(cardActionAllowed("replace", "blocked", true)).toBe(true);
  });
  it("a frozen card shows no private details", () => {
    expect(cardActionAllowed("reveal", "frozen", true)).toBe(false);
  });
  it("generation 0 keeps the original card numbers", () => {
    expect(generationLabel(0)).toBe("");
    expect(generationLabel(3)).toBe(":g3");
    expect(() => generationLabel(-1)).toThrow();
  });
  it("the unlock window lasts 2 minutes and belongs to one member and one card", () => {
    expect(CARD_UNLOCK_TTL_S).toBe(120);
    const p = cardUnlockPayload("u1", 1000, 1120, "0123456789abcdef");
    expect(checkCardUnlockPayload(p, "u1", 1000)).toEqual({ issuedAtSec: 1000, expiresAtSec: 1120, cardTag: "0123456789abcdef" });
    expect(checkCardUnlockPayload(p, "u2", 1000)).toBeNull();
    expect(checkCardUnlockPayload(p, "u1", 1120)).toBeNull();
    // Longer than 2 minutes is never accepted, even when signed.
    expect(checkCardUnlockPayload(cardUnlockPayload("u1", 1000, 1121, "0123456789abcdef"), "u1", 1000)).toBeNull();
    expect(checkCardUnlockPayload(cardUnlockPayload("u1", 1000, 1200, "not-a-tag"), "u1", 1000)).toBeNull();
  });
  it("the window ends 2 minutes after the verification itself, not after the click", () => {
    expect(cardUnlockExpiry(1000, 1000)).toBe(1120);
    expect(cardUnlockExpiry(1000, 1100)).toBe(1120);
    expect(cardUnlockExpiry(1000, 1300)).toBeNull();
  });
});

describe("ROUT card verification methods", () => {
  it("2FA means passkey, authenticator app or SMS; a password alone is not 2FA", () => {
    expect(hasSecondFactor({ passkey: false, totp: false, sms: false, password: true })).toBe(false);
    expect(hasSecondFactor({ passkey: false, totp: false, sms: true })).toBe(true);
  });
  it("card actions accept passkey, SMS, recovery code and password, never e-mail", () => {
    const m = allowedStepUpMethods({ passkey: true, totp: true, sms: true, backup: true, password: true }, "card_reveal");
    expect(m).toEqual(["passkey", "totp", "sms", "backup", "password"]);
    expect(allowedStepUpMethods({ passkey: false, totp: false, password: true }, "card_reveal")).toEqual([]);
  });
  it("a card-only proof never unlocks other sensitive actions", () => {
    expect(methodAcceptedFor("account_delete", "password")).toBe(false);
    expect(methodAcceptedFor("account_delete", "sms")).toBe(false);
    expect(methodAcceptedFor("card_reveal", "password")).toBe(true);
    expect(methodAcceptedFor("card_reveal", "email")).toBe(false);
  });
});
