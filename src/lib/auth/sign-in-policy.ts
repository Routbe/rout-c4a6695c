/**
 * Sign-in policy for the Better Auth gateway (`/api/auth/*`).
 *
 * First factor (any of):
 *   - a WebAuthn passkey assertion (user verification required) — complete on its own;
 *   - e-mail + password (`/sign-in/email`);
 *   - a one-time e-mail link (`/sign-in/magic-link` → `/magic-link/verify`).
 * When the member has 2FA switched on, password and e-mail-link sign-ins stop at a
 * second step: authenticator app (TOTP), SMS code, recovery code or a passkey.
 * Admins must have 2FA switched on before any admin surface answers.
 *
 * New accounts are still created only through the passkey sign-up ticket;
 * configured providers can sign in existing members on the public portal.
 */

/** Paths Better Auth may serve. Everything else answers 410 `method_disabled`. */
const ALLOWED_EXACT = new Set([
  "/get-session",
  "/sign-out",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/update-user",
  "/delete-user",
  "/list-accounts",
  "/unlink-account",
  // Linking a social identity to the signed-in member (never a sign-in).
  "/link-social",
  "/oauth2/link",
  "/sign-in/social",
  "/sign-in/oauth2",
  "/fediverse/verify",
  // First factors besides passkeys.
  "/sign-in/email",
  "/sign-in/magic-link",
  "/magic-link/verify",
  // Password set/reset by e-mail, and change while signed in (needs the current one).
  "/request-password-reset",
  "/reset-password",
  "/change-password",
]);
const ALLOWED_PREFIXES = ["/passkey/", "/two-factor/", "/callback/", "/oauth2/callback/", "/reset-password/"];

export type AuthPathDecision = { allow: true } | { allow: false; code: "method_disabled" };

export function signInPathDecision(relativePath: string): AuthPathDecision {
  const path = relativePath.replace(/\/+$/, "") || "/";
  if (ALLOWED_EXACT.has(path) || ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return { allow: true };
  return { allow: false, code: "method_disabled" };
}

/** Public first-factor endpoints: bot check + fail-closed rate limit before Better Auth. */
export const FIRST_FACTOR_PATHS: ReadonlySet<string> = new Set(["/sign-in/email", "/sign-in/magic-link", "/request-password-reset"]);

export const METHOD_DISABLED_MESSAGE =
  "Deze aanmeldmethode bestaat niet bij ROUT. Log in met je passkey, een e-maillink of je wachtwoord.";

/** Context prefixes for first-passkey registration without a session. */
export const SIGNUP_CONTEXT_PREFIX = "su.";
export const RECOVERY_CONTEXT_PREFIX = "rq.";

/* ---------- second factor ---------- */

export type SecondFactorFacts = {
  /** Authenticator app set up and confirmed. */
  totp: boolean;
  /** Masked verified phone number, when SMS can actually be sent. */
  smsTo: string | null;
  /** The member owns at least one passkey. */
  passkey: boolean;
  /** Recovery codes exist (they come with the authenticator app). */
  backupCodes: boolean;
};

export type SecondFactorMethod = "totp" | "sms" | "passkey" | "backup";

/** Second-step choices shown to the member, strongest first. E-mail is never a second factor. */
export function secondFactorMethods(f: SecondFactorFacts): SecondFactorMethod[] {
  const out: SecondFactorMethod[] = [];
  if (f.passkey) out.push("passkey");
  if (f.totp) out.push("totp");
  if (f.smsTo) out.push("sms");
  if (f.backupCodes) out.push("backup");
  return out;
}

/** SMS codes only go to a verified number through a configured provider. */
export function smsSecondFactorAvailable(phoneVerified: boolean, smsConfigured: boolean): boolean {
  return phoneVerified && smsConfigured;
}

/** Admins may use the admin portal only once 2FA is switched on. */
export function adminAccessDecision(isAdmin: boolean, twoFactorEnabled: boolean): "allow" | "forbidden" | "two_factor_setup_required" {
  if (!isAdmin) return "forbidden";
  return twoFactorEnabled ? "allow" : "two_factor_setup_required";
}

export const ADMIN_TWO_FACTOR_REQUIRED = "admin_two_factor_required";
