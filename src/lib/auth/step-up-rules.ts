/**
 * Pure rules for step-up re-verification on sensitive actions.
 * Passkey or TOTP are required once either is enrolled; an e-mail code is only a
 * fallback for accounts that have neither.
 * ROUT card actions accept every factor the member has active (passkey, TOTP,
 * SMS, recovery code, password), but never e-mail, and only after 2FA is on.
 */
export const STEP_UP_MAX_AGE_SEC = 120;
export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED";
export const STEP_UP_COOKIE = "rout_stepup";

export type StepUpMethod = "passkey" | "totp" | "email" | "sms" | "backup" | "password";
export type StepUpAction = "vault_export" | "account_delete" | "oauth_secret" | "workspace_role" | "account_merge" | "oauth_subject_type" | "primary_email_change" | "app_email_reassign" | "app_email_revoke" | "passkey_add" | "recovery_vault" | "card_reveal" | "card_lifecycle" | "card_scan" | "vault_token_read";

export type EnrolledFactors = { passkey: boolean; totp: boolean; sms?: boolean; backup?: boolean; password?: boolean };

/** Actions on the private ROUT card (show its codes, freeze/block/replace it). */
export const CARD_STEP_UP_ACTIONS: readonly StepUpAction[] = ["card_reveal", "card_lifecycle"];
export const isCardStepUpAction = (action: StepUpAction | undefined) => !!action && CARD_STEP_UP_ACTIONS.includes(action);
/**
 * Someone scanning a ROUT card proves themselves with a real second factor only
 * (passkey, authenticator app or SMS): a scan never shows anything before that.
 */
export const CARD_SCAN_ACTION: StepUpAction = "card_scan";
/** Proofs for these actions work once and only for the action they were given for. */
export const SINGLE_USE_STEP_UP_ACTIONS: readonly StepUpAction[] = ["card_reveal", "card_lifecycle", "card_scan", "vault_token_read"];
/** Opening a vault token (db/0221) needs a passkey, nothing else, spent once. */
export const VAULT_READ_ACTION: StepUpAction = "vault_token_read";
export const isSingleUseStepUpAction = (action: StepUpAction | undefined) => !!action && SINGLE_USE_STEP_UP_ACTIONS.includes(action);

/** A real second factor: passkey, authenticator app or a verified phone for SMS. */
export function hasSecondFactor(enrolled: EnrolledFactors): boolean {
  // Backup codes only exist once an authenticator app was enrolled, so they prove 2FA is on.
  return enrolled.passkey || enrolled.totp || !!enrolled.sms || !!enrolled.backup;
}

export function allowedStepUpMethods(enrolled: EnrolledFactors, action?: StepUpAction): StepUpMethod[] {
  if (action === VAULT_READ_ACTION) return enrolled.passkey ? ["passkey"] : [];
  if (action === CARD_SCAN_ACTION) {
    const scan: StepUpMethod[] = [];
    if (enrolled.passkey) scan.push("passkey");
    if (enrolled.totp) scan.push("totp");
    if (enrolled.sms) scan.push("sms");
    return scan;
  }
  if (isCardStepUpAction(action)) {
    if (!hasSecondFactor(enrolled)) return [];
    const card: StepUpMethod[] = [];
    if (enrolled.passkey) card.push("passkey");
    if (enrolled.totp) card.push("totp");
    if (enrolled.sms) card.push("sms");
    if (enrolled.backup) card.push("backup");
    if (enrolled.password) card.push("password");
    return card;
  }
  const strong: StepUpMethod[] = [];
  if (enrolled.passkey) strong.push("passkey");
  if (enrolled.totp) strong.push("totp");
  return strong.length ? strong : ["email"];
}

/** Which proofs a given action accepts; card-only methods never unlock other actions. */
export function methodAcceptedFor(action: StepUpAction, method: StepUpMethod): boolean {
  if (action === VAULT_READ_ACTION) return method === "passkey";
  if (action === CARD_SCAN_ACTION) return method === "passkey" || method === "totp" || method === "sms";
  if (isCardStepUpAction(action)) return method !== "email";
  return method === "passkey" || method === "totp" || method === "email";
}

const STEP_UP_METHODS: readonly StepUpMethod[] = ["passkey", "totp", "email", "sms", "backup", "password"];

const ACTIONS: readonly StepUpAction[] = ["vault_export", "account_delete", "oauth_secret", "workspace_role", "account_merge", "oauth_subject_type", "primary_email_change", "app_email_reassign", "app_email_revoke", "passkey_add", "recovery_vault", "card_reveal", "card_lifecycle", "card_scan", "vault_token_read"];
const JTI = /^[A-Za-z0-9_-]{22}$/;

/** 128-bit random proof id (22 base64url chars), so one proof can be spent exactly once. */
export function newStepUpJti(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Signed proof body: `v2.<user>.<method>.<verified at s>.<scope>.<proof id>`.
 * Scope is the action the member confirmed for, or `*` for a passkey or general proof.
 */
export function stepUpPayload(userId: string, method: StepUpMethod, verifiedAtSec: number, scope: StepUpAction | "*" = "*", jti: string = newStepUpJti()): string {
  return `v2.${userId}.${method}.${verifiedAtSec}.${scope}.${jti}`;
}

export type StepUpProof = { method: StepUpMethod; verifiedAtSec: number; scope: StepUpAction | "*"; jti: string };

/** Parses a payload and checks owner + freshness; returns the proof or null. */
export function parseStepUpPayload(payload: string, userId: string, nowSec: number): StepUpProof | null {
  const parts = payload.split(".");
  if (parts.length !== 6) return null;
  const [v, uid, method, ts, scope, jti] = parts as [string, string, string, string, string, string];
  if (v !== "v2" || uid !== userId) return null;
  if (!STEP_UP_METHODS.includes(method as StepUpMethod)) return null;
  if (scope !== "*" && !ACTIONS.includes(scope as StepUpAction)) return null;
  if (!JTI.test(jti)) return null;
  const at = Number(ts);
  if (!Number.isSafeInteger(at) || at > nowSec + 5) return null;
  if (nowSec - at > STEP_UP_MAX_AGE_SEC) return null;
  return { method: method as StepUpMethod, verifiedAtSec: at, scope: scope as StepUpAction | "*", jti };
}

/** Back-compatible check: the method of a valid, fresh proof, else null. */
export function checkStepUpPayload(payload: string, userId: string, nowSec: number): StepUpMethod | null {
  return parseStepUpPayload(payload, userId, nowSec)?.method ?? null;
}

/**
 * Whether a proof may authorise an action. Card actions need a proof given for
 * exactly that action; only a passkey (verified by the WebAuthn hook) may be general.
 * A proof given for one action never authorises another.
 */
export function proofCoversAction(proof: StepUpProof, action: StepUpAction): boolean {
  if (!methodAcceptedFor(action, proof.method)) return false;
  if (proof.scope === action) return true;
  if (proof.scope !== "*") return false;
  return isSingleUseStepUpAction(action) ? proof.method === "passkey" : true;
}

export function isStepUpRequiredError(e: unknown): boolean {
  return e instanceof Error && e.message.includes(STEP_UP_REQUIRED);
}
