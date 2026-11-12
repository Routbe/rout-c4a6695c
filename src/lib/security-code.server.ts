import { sql } from "@/lib/neon";
import { hashToken } from "@/lib/auth/token-hash.server";
import { generateOtp } from "@/lib/phone/otp-rules";

/**
 * Six-digit e-mail codes for sensitive account changes (merge, password,
 * 2FA). Stored only as digests, 10 minutes, max 5 tries, single use.
 */
export type SecurityPurpose = "merge" | "password" | "two_factor" | "workspace_convert" | "delete_account" | "identity_link" | "step_up" | "step_up_sms";

const TTL_MIN = 10;

/**
 * The table is closed to the app role (db/0226): the database takes the member
 * from the request context, caps issuing, and enforces expiry, 5 tries and
 * single use. Only the digest leaves this process.
 */
async function storeCode(userId: string, purpose: SecurityPurpose, code: string): Promise<"ok" | "rate_limited"> {
  const rows = (await sql`select public.rout_security_code_issue(${userId}::uuid, ${purpose}, ${await hashToken(`${userId}:${purpose}:${code}`)}, ${TTL_MIN}) as status`) as { status: string }[];
  const status = rows[0]?.status;
  if (status === "ok" || status === "rate_limited") return status;
  throw new Error(`security_code_${status ?? "missing"}`);
}

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
  const stored = await storeCode(userId, purpose, code);
  if (stored !== "ok") return { ok: false as const, reason: "rate_limited" as const };
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
  const stored = await storeCode(userId, purpose, code);
  if (stored !== "ok") return { ok: false as const, reason: "rate_limited" as const };
  const { sendSecondFactorSms } = await import("@/lib/auth/second-factor.server");
  if (!(await sendSecondFactorSms(authUserId, code))) return { ok: false as const, reason: "not_sent" as const };
  return { ok: true as const };
}

/** Deletes codes that expired over 30 minutes ago or were already used. */
export async function purgeExpiredSecurityCodes(): Promise<{ deleted: number }> {
  const rows = (await sql`select public.rout_security_code_purge() as deleted`) as { deleted: number }[];
  return { deleted: Number(rows[0]?.deleted ?? 0) };
}

/** Consumes the code when it matches. */
export async function consumeSecurityCode(userId: string, purpose: SecurityPurpose, code: string): Promise<boolean> {
  const clean = (code ?? "").replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const rows = (await sql`select public.rout_security_code_consume(${userId}::uuid, ${purpose}, ${await hashToken(`${userId}:${purpose}:${clean}`)}) as ok`) as { ok: boolean }[];
  return rows[0]?.ok === true;
}

