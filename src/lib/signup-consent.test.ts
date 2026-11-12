import { describe, expect, it } from "vitest";
import { canSubmitSignUp, DIGITAL_CONSENT_AGE, missingSignUpConsent, SIGNUP_CONSENT_VERSION } from "./signup-consent";

describe("sign-up consent", () => {
  it("keeps the create-account button disabled until the box is ticked", () => {
    expect(canSubmitSignUp({ consented: false, busy: false, unavailable: false, emailError: false })).toBe(false);
    expect(canSubmitSignUp({ consented: true, busy: false, unavailable: false, emailError: false })).toBe(true);
  });
  it("refuses a local sign-up request without consent", () => {
    expect(missingSignUpConsent("POST", "/sign-up/email", null)).toBe(true);
    expect(missingSignUpConsent("POST", "/sign-up/email", "yes")).toBe(true);
    expect(missingSignUpConsent("POST", "/sign-up/email", SIGNUP_CONSENT_VERSION)).toBe(false);
  });
  it("does not block sign-in or social login", () => {
    expect(missingSignUpConsent("POST", "/sign-in/email", null)).toBe(false);
    expect(missingSignUpConsent("POST", "/sign-in/social", null)).toBe(false);
  });
  it("uses the EU digital consent age of 16", () => {
    expect(DIGITAL_CONSENT_AGE).toBe(16);
  });
});
