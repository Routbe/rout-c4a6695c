import { ensureStepUpSession, StepUpRequiredError } from "./step-up.server";
export type PasskeyAction = "primary_email_change" | "account_merge" | "app_email_reassign" | "app_email_revoke" | "recovery_vault";
/** Only a verified UV passkey proof can authorize identity-routing changes. */
export async function requirePasskeyStepUp(userId: string, action: PasskeyAction, readCookie?: () => string | undefined) {
  const method = await ensureStepUpSession(userId, action, readCookie);
  if (method !== "passkey") throw new StepUpRequiredError();
  return method;
}