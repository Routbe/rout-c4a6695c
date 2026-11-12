import { sql } from "@/lib/neon";
import { hitRateLimit } from "@/lib/rate-limit-db.server";
import { RATE_RULES } from "@/lib/rate-limit-rules";
import { INBOUND_VERIFY_LINE, usesAutoSms, generateOtp, maskPhone, OTP_TTL_MS } from "./otp-rules";
import { encryptText, keyedHash } from "./phone-crypto";
import { getSmsSender, missingSmsKeys } from "./sms-provider.server";

const secret = () => process.env["PHONE_ENCRYPTION_KEY"] ?? "";

export type PhoneStatus = { configured: boolean; verified: boolean; masked: string | null };

export async function phoneStatus(userId: string): Promise<PhoneStatus> {
  const configured = missingSmsKeys().length === 0;
  try {
    const rows = (await sql`select phone_last4, phone_verified from public.user_phone_numbers
      where user_id = ${userId} limit 1`) as { phone_last4: string; phone_verified: boolean }[];
    const r = rows[0];
    return { configured, verified: Boolean(r?.phone_verified), masked: r ? maskPhone(r.phone_last4) : null };
  } catch {
    return { configured, verified: false, masked: null };
  }
}

export type RequestResult =
  | { status: "sent"; expiresAt: string; masked: string }
  | { status: "not_configured" }
  | { status: "rate_limited"; retryAfter: number }
  | { status: "send_failed" }
  | { status: "manual"; code: string; expiresAt: string; masked: string; line: string };

export async function requestPhoneCode(userId: string, phone: string, ip: string): Promise<RequestResult> {
  const auto = usesAutoSms(phone) || process.env["SMS_ALLOW_INTERNATIONAL"]?.trim() === "true";
  const sender = getSmsSender();
  if (auto && !sender) {
    console.warn(`[phone] SMS not configured; missing ${missingSmsKeys().join(", ")}`);
    return { status: "not_configured" };
  }
  const phoneHash = await keyedHash(phone, secret());
  for (const [name, subject, rule] of [
    ["sms-user", userId, RATE_RULES.smsSendUser],
    ["sms-phone", phoneHash, RATE_RULES.smsSendPhone],
    ["sms-ip", ip, RATE_RULES.smsSendIp],
  ] as const) {
    const r = await hitRateLimit(name, subject, rule);
    if (!r.ok) return { status: "rate_limited", retryAfter: r.retryAfter };
  }
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const last4 = phone.slice(-4);
  // The database retires older open codes and enforces its own hourly caps (db/0226).
  const issued = (await sql`select public.rout_phone_code_issue(${userId}::uuid, ${phoneHash}, ${await encryptText(phone, secret())},
    ${last4}, ${await keyedHash(`${userId}:${code}`, secret())}, ${expiresAt}::timestamptz) as status`) as { status: string }[];
  const issueStatus = issued[0]?.status;
  if (issueStatus === "rate_limited") return { status: "rate_limited", retryAfter: 3600 };
  if (issueStatus !== "ok") throw new Error(`phone_code_${issueStatus ?? "missing"}`);
  if (!auto) {
    // International: the member sends this code from their own number (or via
    // Telegram); an admin/inbound handler confirms it. No costly outbound SMS.
    return { status: "manual", code, expiresAt, masked: maskPhone(last4), line: INBOUND_VERIFY_LINE };
  }
  try {
    await sender!.send(phone, `Je ROUT-code: ${code}. Geldig 10 minuten. Deel deze code met niemand.`);
  } catch {
    return { status: "send_failed" };
  }
  return { status: "sent", expiresAt, masked: maskPhone(last4) };
}

export type VerifyResult = { status: "verified"; masked: string } | { status: "expired" | "too_many_attempts" | "invalid" | "no_code" | "rate_limited" };

export async function verifyPhoneCode(userId: string, code: string): Promise<VerifyResult> {
  const limit = await hitRateLimit("sms-verify", userId, RATE_RULES.smsVerify);
  if (!limit.ok) return { status: "rate_limited" };
  const rows = (await sql`select status, last4 from public.rout_phone_code_verify(${userId}::uuid,
    ${await keyedHash(`${userId}:${code}`, secret())})`) as { status: string; last4: string | null }[];
  const r = rows[0];
  if (r?.status === "verified" && r.last4) return { status: "verified", masked: maskPhone(r.last4) };
  if (r?.status === "expired" || r?.status === "too_many_attempts" || r?.status === "invalid") return { status: r.status };
  return { status: "no_code" };
}

export async function removePhone(userId: string): Promise<void> {
  await sql`delete from public.user_phone_numbers where user_id = ${userId}`;
  await sql`select public.rout_phone_code_cancel(${userId}::uuid)`;
}

/**
 * Inbound verification (international numbers): the member texts their code
 * from their own phone to our line; the gateway webhook calls this. The code
 * only counts when it arrives from the same number it was issued for.
 */
export async function confirmInboundCode(fromPhone: string, text: string): Promise<boolean> {
  const code = text.match(/\b(\d{6})\b/)?.[1];
  if (!code) return false;
  const phoneHash = await keyedHash(fromPhone, secret());
  // Two steps: the code digest is keyed on the member, which only the database knows for this number.
  const found = (await sql`select code_id, user_id from public.rout_phone_inbound_candidate(${phoneHash})`) as { code_id: string; user_id: string }[];
  const candidate = found[0];
  if (!candidate) return false;
  const done = (await sql`select public.rout_phone_inbound_confirm(${candidate.code_id}::uuid, ${phoneHash},
    ${await keyedHash(`${candidate.user_id}:${code}`, secret())}) as ok`) as { ok: boolean }[];
  return done[0]?.ok === true;
}

export type PendingPhoneVerification = { id: string; masked: string; createdAt: string; attempts: number };

/** Admin queue: open, unexpired phone codes (never exposes the number or code). */
export async function listPendingPhoneVerifications(limit = 50): Promise<PendingPhoneVerification[]> {
  const rows = (await sql`select id, phone_last4, created_at, attempts from public.rout_phone_pending_list(${limit}::integer)`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r["id"]),
    masked: maskPhone(String(r["phone_last4"])),
    createdAt: new Date(String(r["created_at"])).toISOString(),
    attempts: Number(r["attempts"]),
  }));
}

/** Admin: consume an open code and mark the member's number verified. */
export async function approvePhoneVerification(codeId: string): Promise<boolean> {
  const rows = (await sql`select public.rout_phone_admin_approve(${codeId}::uuid) as ok`) as { ok: boolean }[];
  return rows[0]?.ok === true;
}
