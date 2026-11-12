import { describe, expect, it } from "vitest";
import { adminAccessDecision, secondFactorMethods, signInPathDecision, smsSecondFactorAvailable } from "./sign-in-policy";
import { signSignupTicket, verifySignupTicket, SIGNUP_TICKET_TTL_S } from "./signup-ticket";

describe("sign-in gateway policy", () => {
  it.each([
    "/sign-in/email",
    "/sign-in/magic-link",
    "/magic-link/verify",
    "/request-password-reset",
    "/reset-password",
    "/reset-password/abc123",
    "/change-password",
    "/two-factor/verify-totp",
    "/two-factor/send-otp",
    "/two-factor/verify-otp",
    "/two-factor/verify-backup-code",
    "/two-factor/options",
    "/passkey/generate-authenticate-options",
    "/passkey/verify-authentication",
    "/passkey/generate-register-options",
    "/passkey/verify-registration",
    "/get-session",
    "/sign-out",
    "/link-social",
    "/callback/google",
    "/sign-in/social",
    "/sign-in/oauth2",
  ])("allows %s", (path) => {
    expect(signInPathDecision(path)).toEqual({ allow: true });
  });

  it.each([
    // New accounts only via the reviewed passkey sign-up ticket.
    "/sign-up/email",
    "/forget-password",
    "/set-password",
    "/verify-email",
    "/something-new",
  ])("refuses %s", (path) => {
    expect(signInPathDecision(path)).toEqual({ allow: false, code: "method_disabled" });
  });
});

describe("second sign-in step", () => {
  it("offers passkey, app, SMS and recovery code — never e-mail", () => {
    expect(secondFactorMethods({ totp: true, smsTo: "•••• 12", passkey: true, backupCodes: true })).toEqual(["passkey", "totp", "sms", "backup"]);
    expect(secondFactorMethods({ totp: false, smsTo: null, passkey: false, backupCodes: false })).toEqual([]);
  });
  it("sends SMS only to a verified number with a configured provider", () => {
    expect(smsSecondFactorAvailable(true, true)).toBe(true);
    expect(smsSecondFactorAvailable(false, true)).toBe(false);
    expect(smsSecondFactorAvailable(true, false)).toBe(false);
  });
});

describe("admin access", () => {
  it("requires 2FA to be switched on for admins", () => {
    expect(adminAccessDecision(true, true)).toBe("allow");
    expect(adminAccessDecision(true, false)).toBe("two_factor_setup_required");
    expect(adminAccessDecision(false, true)).toBe("forbidden");
  });
});

describe("sign-up ticket", () => {
  const secret = "x".repeat(40);
  const data = { email: "a@b.be", name: "A", dob: "2000-01-01", parentEmail: null, consent: "v1" };

  it("round-trips and expires after 10 minutes", async () => {
    const t = await signSignupTicket(secret, data, 1000);
    expect((await verifySignupTicket(secret, t, 1000))?.email).toBe("a@b.be");
    expect(SIGNUP_TICKET_TTL_S).toBe(600);
    expect(await verifySignupTicket(secret, t, 1000 + 601)).toBeNull();
  });

  it("rejects a tampered ticket or another secret", async () => {
    const t = await signSignupTicket(secret, data, 1000);
    const [prefix, sig] = [t.slice(0, t.lastIndexOf(".")), t.slice(t.lastIndexOf(".") + 1)];
    expect(await verifySignupTicket(secret, `${prefix}x.${sig}`, 1000)).toBeNull();
    expect(await verifySignupTicket("y".repeat(40), t, 1000)).toBeNull();
  });
});
