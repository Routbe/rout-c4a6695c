import { sql } from "@/lib/neon";
import { hashToken } from "@/lib/auth/token-hash.server";
import { generateOtp } from "@/lib/phone/otp-rules";

/**
 * Six-digit e-mail codes for sensitive account changes (merge, password,
 * 2FA). Stored only as digests, 10 minutes, max 5 tries, single use.
 */
export type SecurityPurpose = "merge" | "password" | "two_factor" | "workspace_convert" | "delete_account" | "identity_link" | "step_up" | "step_up_sms";

const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

async function emailOf(userId: string): Promise<string | null> {
  const rows = (await sql`select email from public.users where id = ${userId} limit 1`) as { email: string | null }[];
  return rows[0]?.email ?? null;
}

export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export async function issueSecurityCode(userId: string, purpose: SecurityPurpose, request?: Request | null) {
  const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
  const limit = await hitRateLimit("security-code", `${userId}:${purpose}`, { limit: 5, windowSec: 15 * 60 });
  if (!limit.ok) return { ok: false as const, reason: "rate_limited" as const };
  const email = await emailOf(userId);
  if (!email) return { ok: false as const, reason: "no_email" as const };
  const code = generateOtp();
  // Lazy cleanup: verification already ignores expired rows; old ones are dropped here, non-blocking.
  void purgeExpiredSecurityCodes().catch(() => undefined);
  await sql`update public.security_codes set consumed_at = now()
    where user_id = ${userId} and purpose = ${purpose} and consumed_at is null`;
  await sql`insert into public.security_codes (user_id, purpose, code_hash, expires_at)
    values (${userId}, ${purpose}, ${await hashToken(`${userId}:${purpose}:${code}`)}, now() + make_interval(mins => ${TTL_MIN}))`;
  const { sendLocalizedEmail, localeFromRequest } = await import("@/lib/email.server");
  await sendLocalizedEmail({ to: email, intent: "verification", locale: localeFromRequest(request ?? null), payload: { code } });
  return { ok: true as const, sentTo: maskEmail(email) };
}

/** Six-digit step-up code by SMS to the member's verified number (ROUT card actions only). */
export async function issueSmsSecurityCode(userId: string, authUserId: string) {
  const purpose: SecurityPurpose = "step_up_sms";
  const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
  const limit = await hitRateLimit("security-code", `${userId}:${purpose}`, { limit: 5, windowSec: 15 * 60 }, { failClosed: true });
  if (!limit.ok) return { ok: false as const, reason: "rate_limited" as const };
  const code = generateOtp();
  await sql`update public.security_codes set consumed_at = now()
    where user_id = ${userId} and purpose = ${purpose} and consumed_at is null`;
  await sql`insert into public.security_codes (user_id, purpose, code_hash, expires_at)
    values (${userId}, ${purpose}, ${await hashToken(`${userId}:${purpose}:${code}`)}, now() + make_interval(mins => ${TTL_MIN}))`;
  const { sendSecondFactorSms } = await import("@/lib/auth/second-factor.server");
  if (!(await sendSecondFactorSms(authUserId, code))) return { ok: false as const, reason: "not_sent" as const };
  return { ok: true as const };
}

/** Deletes codes that expired over 30 minutes ago or were already used. */
export async function purgeExpiredSecurityCodes(): Promise<{ deleted: number }> {
  const rows = (await sql`delete from public.security_codes
    where expires_at < now() - interval '30 minutes' or consumed_at < now() - interval '30 minutes'
    returning 1`) as unknown[];
  return { deleted: rows.length };
}

/** Consumes the code when it matches. */
export async function consumeSecurityCode(userId: string, purpose: SecurityPurpose, code: string): Promise<boolean> {
  const clean = (code ?? "").replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const rows = (await sql`select id, code_hash, attempts from public.security_codes
    where user_id = ${userId} and purpose = ${purpose} and consumed_at is null and expires_at > now()
    order by created_at desc limit 1`) as { id: string; code_hash: string; attempts: number }[];
  const row = rows[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;
  if ((await hashToken(`${userId}:${purpose}:${clean}`)) !== row.code_hash) {
    await sql`update public.security_codes set attempts = attempts + 1 where id = ${row.id}`;
    return false;
  }
  const done = (await sql`update public.security_codes set consumed_at = now()
    where id = ${row.id} and consumed_at is null returning id`) as unknown[];
  return done.length === 1;
}

