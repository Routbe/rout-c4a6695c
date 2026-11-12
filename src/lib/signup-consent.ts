/**
 * Sign-up consent (terms + privacy). The birth date and, under 16, a parent
 * email travel as separate headers (minor-safety.ts, db/0174); the auth
 * endpoint refuses a local sign-up without consent or with invalid age fields.
 */
export const SIGNUP_CONSENT_HEADER = "x-rout-consent";
export const SIGNUP_CONSENT_VERSION = "terms-privacy-16plus-v1";
export const DIGITAL_CONSENT_AGE = 16;

/** The local (email + password) account-creation endpoint. */
export const LOCAL_SIGNUP_PATH = "/sign-up/email";

/** The create-account button only becomes active once the box is ticked. */
export function canSubmitSignUp(input: { consented: boolean; busy: boolean; unavailable: boolean; emailError: boolean }): boolean {
  return input.consented && !input.busy && !input.unavailable && !input.emailError;
}

/** True when a request would create a local account without the consent header. */
export function missingSignUpConsent(method: string, relativePath: string, headerValue: string | null): boolean {
  return method.toUpperCase() === "POST" && relativePath === LOCAL_SIGNUP_PATH && headerValue !== SIGNUP_CONSENT_VERSION;
}
