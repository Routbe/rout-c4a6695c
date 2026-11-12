/**
 * ensureStepUpSession: sensitive actions need a passkey/TOTP (or, without those,
 * e-mail code) verification of at most 120 s old, proven by an HMAC-signed HttpOnly cookie.
 * Proofs carry the action they were given for and a random id; card actions spend that id once.
 */
import {
  STEP_UP_COOKIE,
  STEP_UP_MAX_AGE_SEC,
  STEP_UP_REQUIRED,
  allowedStepUpMethods,
  isSingleUseStepUpAction,
  newStepUpJti,
  parseStepUpPayload,
  proofCoversAction,
  stepUpPayload,
  type EnrolledFactors,
  type StepUpProof,
  type StepUpAction,
  type StepUpMethod,
} from "@/lib/auth/step-up-rules";
import { hmacSha256Hex } from "@/lib/audit-chain";

export class StepUpRequiredError extends Error {
  status = 401;
  constructor() {
    super(STEP_UP_REQUIRED);
  }
}

async function secret(): Promise<string> {
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const s = resolveAuthSecret();
  if (!s) throw new Error("auth secret missing");
  return `stepup:${s.secret}`;
}

async function sign(payload: string) {
  return `${payload}.${await hmacSha256Hex(await secret(), payload)}`;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Checks a raw cookie value and returns the full proof; exported for tests. */
export async function verifyStepUpProof(raw: string | null | undefined, userId: string, nowSec = Math.floor(Date.now() / 1000)): Promise<StepUpProof | null> {
  if (!raw || raw.length > 400) return null;
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const payload = raw.slice(0, i);
  if (!safeEqual(raw.slice(i + 1), await hmacSha256Hex(await secret(), payload))) return null;
  return parseStepUpPayload(payload, userId, nowSec);
}

/** Checks a raw cookie value; returns the method of a valid proof. */
export async function verifyStepUpCookie(raw: string | null | undefined, userId: string, nowSec = Math.floor(Date.now() / 1000)) {
  return (await verifyStepUpProof(raw, userId, nowSec))?.method ?? null;
}

/** Sign-in factors of a member (public user id). Unknown facts count as absent. */
export async function enrolledFactors(userId: string): Promise<EnrolledFactors & { authUserId: string | null }> {
  const { sql } = await import("@/lib/neon");
  const rows = (await sql`
    select bu.id::text as auth_id,
           -- neon_auth.passkey/"twoFactor"."userId" are text while "user".id is uuid: compare as text,
           -- otherwise the whole lookup errors and every member looks like they have no second step.
           (coalesce(bu."twoFactorEnabled", false) or exists (select 1 from neon_auth."twoFactor" t
              where t."userId"::text = bu.id::text and t.secret is not null and coalesce(t.verified, true))) as totp,
           exists (select 1 from neon_auth.passkey p where p."userId"::text = bu.id::text) as passkey,
           exists (select 1 from neon_auth."twoFactor" t where t."userId"::text = bu.id::text and t."backupCodes" is not null and t."backupCodes" <> '[]') as backup,
           exists (select 1 from neon_auth.account a where a."userId"::text = bu.id::text and a."providerId" = 'credential' and a.password is not null) as password
    from public.users u
    left join neon_auth."user" bu on bu.id::text = coalesce(u.auth_user_id::text, u.user_metadata->>'neon_auth_id')
    where u.id = ${userId} limit 1`) as { auth_id: string | null; totp: boolean | null; passkey: boolean | null; backup: boolean | null; password: boolean | null }[];
  const r = rows[0];
  const totp = Boolean(r?.totp);
  let sms = false;
  try {
    const { phoneStatus } = await import("@/lib/phone/phone-otp.server");
    const { smsSecondFactorAvailable } = await import("./sign-in-policy");
    const phone = await phoneStatus(userId);
    sms = smsSecondFactorAvailable(phone.verified, phone.configured);
  } catch {
    sms = false;
  }
  // Recovery codes only belong to an active authenticator app.
  return { authUserId: r?.auth_id ?? null, totp, passkey: Boolean(r?.passkey), sms, backup: totp && Boolean(r?.backup), password: Boolean(r?.password) };
}

/**
 * Throws StepUpRequiredError (401) unless a fresh step-up proof covers this action.
 * Card actions spend the proof atomically in the database, so a copied or
 * concurrent proof works at most once; storage errors fail closed.
 */
export async function ensureStepUpProof(userId: string, action: StepUpAction, readCookie?: () => string | undefined): Promise<StepUpProof> {
  let raw: string | undefined;
  if (readCookie) raw = readCookie();
  else {
    const { readRequestCookie } = await import("@/lib/request-context");
    raw = readRequestCookie(STEP_UP_COOKIE);
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const parsed = await verifyStepUpProof(raw, userId, nowSec);
  let proof = parsed && proofCoversAction(parsed, action) ? parsed : null;
  if (proof && isSingleUseStepUpAction(action)) {
    const { useTokenNonce } = await import("@/lib/wallet/card-freeze.server");
    // Kept at least until the proof itself expires (rows stay 5 min past this).
    const exp = Math.min((nowSec + 60) * 1000, (proof.verifiedAtSec + STEP_UP_MAX_AGE_SEC) * 1000);
    const first = exp > Date.now() ? await useTokenNonce(proof.jti, exp).catch(() => null) : null;
    if (first !== true) proof = null;
  }
  if (!proof) {
    if (!readCookie) {
      try {
        const { setCurrentResponseStatus } = await import("@/lib/request-context");
        setCurrentResponseStatus(401);
      } catch {
        /* not inside a request */
      }
    }
    throw new StepUpRequiredError();
  }
  const { recordSecurityEvent } = await import("@/lib/audit-log.server");
  void recordSecurityEvent({ eventType: `step_up.used.${action}`, userId, payload: { method: proof.method } });
  return proof;
}

/** Same check, returning only the method used. */
export async function ensureStepUpSession(userId: string, action: StepUpAction, readCookie?: () => string | undefined) {
  return (await ensureStepUpProof(userId, action, readCookie)).method;
}

/**
 * Records a just-verified passkey proof in the vault enclave on the database's
 * own clock (db/0221). A failure only means vault reads stay closed for this
 * proof; other step-up uses are unaffected.
 */
async function registerVaultPasskeyProof(userId: string, jti: string) {
  try {
    const [{ vaultPort }, { stepUpProofId }] = await Promise.all([import("@/lib/vault/vault-port.server"), import("@/lib/vault/step-up-proof-id")]);
    await vaultPort().registerPasskeyStepUp({ userId }, stepUpProofId(jti));
  } catch {
    console.error("[vault] passkey proof not registered");
  }
}

export async function grantStepUp(userId: string, method: StepUpMethod, emitCookie?: (name: string, value: string) => void, action?: StepUpAction) {
  const allowed = allowedStepUpMethods(await enrolledFactors(userId), action);
  if (!allowed.includes(method)) throw new Error("Deze verificatiemethode is niet toegestaan voor je account.");
  // Every proof except a passkey is bound to the action it was confirmed for.
  const jti = newStepUpJti();
  const value = await sign(stepUpPayload(userId, method, Math.floor(Date.now() / 1000), action ?? "*", jti));
  if (method === "passkey") await registerVaultPasskeyProof(userId, jti);
  if (emitCookie) emitCookie(STEP_UP_COOKIE, value);
  else {
    const { writeResponseCookie: setCookie } = await import("@/lib/request-context");
    setCookie(STEP_UP_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: STEP_UP_MAX_AGE_SEC,
    });
  }
  const { recordSecurityEvent } = await import("@/lib/audit-log.server");
  void recordSecurityEvent({ eventType: "step_up.granted", userId, payload: { method } });
}

/** Spends the current proof, so the next sensitive view asks again. */
export async function consumeStepUp() {
  const { clearResponseCookie } = await import("@/lib/request-context");
  clearResponseCookie(STEP_UP_COOKIE, { path: "/" });
}
