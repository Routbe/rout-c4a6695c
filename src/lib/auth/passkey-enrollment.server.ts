/**
 * First-passkey registration without a session, wired into the Better Auth
 * passkey plugin (`registration.resolveUser` / `afterVerification`).
 *   - `su.…` signed sign-up ticket → creates the account only after the
 *     passkey ceremony verified;
 *   - `rq.…` admin-approved recovery token → binds the quarantined account's
 *     first passkey and burns the token.
 * Signed-in members adding another passkey never reach these paths.
 */
import { RECOVERY_CONTEXT_PREFIX, SIGNUP_CONTEXT_PREFIX } from "./sign-in-policy";
import { verifySignupTicket } from "./signup-ticket";

type RegistrationUser = { id: string; name: string; displayName?: string };
type InternalAdapter = {
  createUser: (user: { email: string; name: string; emailVerified: boolean }) => Promise<{ id: string } | null>;
  findUserByEmail: (email: string) => Promise<{ user: { id: string } } | null>;
};

const reject = (msg: string) => Object.assign(new Error(msg), { status: 400 });

export async function resolveEnrollment(secret: string, context: string | null | undefined): Promise<RegistrationUser> {
  if (context?.startsWith(SIGNUP_CONTEXT_PREFIX)) {
    const t = await verifySignupTicket(secret, context, Math.floor(Date.now() / 1000));
    if (!t) throw reject("signup_ticket_invalid");
    // WebAuthn needs a stable user handle before the account exists; the real id is assigned after verification.
    return { id: `pending-${t.nonce}`, name: t.email, displayName: t.name || t.email };
  }
  if (context?.startsWith(RECOVERY_CONTEXT_PREFIX)) {
    const { resolveBindingToken } = await import("./quarantine.server");
    const hit = await resolveBindingToken(context.slice(RECOVERY_CONTEXT_PREFIX.length));
    if (!hit) throw reject("recovery_token_invalid");
    return { id: hit.authUserId, name: hit.email, displayName: hit.email };
  }
  throw reject("passkey_enrollment_required");
}

export async function finalizeEnrollment(
  secret: string,
  adapter: InternalAdapter,
  context: string | null | undefined,
): Promise<{ userId: string } | void> {
  if (!context) return; // signed-in member adding a passkey
  if (context.startsWith(SIGNUP_CONTEXT_PREFIX)) {
    const t = await verifySignupTicket(secret, context, Math.floor(Date.now() / 1000));
    if (!t) throw reject("signup_ticket_invalid");
    if (await adapter.findUserByEmail(t.email)) throw reject("account_exists");
    const user = await adapter.createUser({ email: t.email, name: t.name || t.email.split("@")[0] || t.email, emailVerified: false });
    if (!user?.id) throw reject("account_create_failed");
    try {
      const { recordSignupAge } = await import("@/lib/minor-safety.server");
      await recordSignupAge(t.email, t.dob, t.parentEmail);
    } catch (e) {
      console.error("[passkey-signup] recording age failed", e instanceof Error ? e.message : e);
    }
    return { userId: user.id };
  }
  if (context.startsWith(RECOVERY_CONTEXT_PREFIX)) {
    const { consumeBindingToken } = await import("./quarantine.server");
    const authUserId = await consumeBindingToken(context.slice(RECOVERY_CONTEXT_PREFIX.length));
    if (!authUserId) throw reject("recovery_token_invalid");
    return { userId: authUserId };
  }
  throw reject("passkey_enrollment_required");
}
