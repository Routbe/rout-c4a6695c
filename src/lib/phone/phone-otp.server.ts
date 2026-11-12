import { sql } from "@/lib/neon";
import { hitRateLimit } from "@/lib/rate-limit-db.server";
import { RATE_RULES } from "@/lib/rate-limit-rules";
import { INBOUND_VERIFY_LINE, usesAutoSms, evaluateOtp, generateOtp, maskPhone, OTP_TTL_MS } from "./otp-rules";
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
  // Older open codes for this user stop working.
  await sql`update public.phone_otp_codes set consumed_at = now() where user_id = ${userId} and consumed_at is null`;
  await sql`insert into public.phone_otp_codes (user_id, phone_hash, phone_number_enc, phone_last4, code_hash, expires_at)
    values (${userId}, ${phoneHash}, ${await encryptText(phone, secret())}, ${last4},
            ${await keyedHash(`${userId}:${code}`, secret())}, ${expiresAt})`;
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
  const rows = (await sql`select * from public.phone_otp_codes where user_id = ${userId} and consumed_at is null
    order by created_at desc limit 1`) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return { status: "no_code" };
  const matches = (await keyedHash(`${userId}:${code}`, secret())) === row["code_hash"];
  const outcome = evaluateOtp(
    { expiresAt: new Date(row["expires_at"] as string).getTime(), attempts: Number(row["attempts"]), consumed: false },
    Date.now(),
    matches,
  );
  if (outcome === "invalid") {
    await sql`update public.phone_otp_codes set attempts = attempts + 1 where id = ${row["id"] as string}`;
    return { status: "invalid" };
  }
  if (outcome !== "ok") return { status: outcome === "consumed" ? "no_code" : outcome };
  await sql`update public.phone_otp_codes set consumed_at = now() where id = ${row["id"] as string}`;
  await sql`insert into public.user_phone_numbers (user_id, phone_number_enc, phone_hash, phone_last4, phone_verified, phone_verified_at)
    values (${userId}, ${row["phone_number_enc"] as string}, ${row["phone_hash"] as string}, ${row["phone_last4"] as string}, true, now())
    on conflict (user_id) do update set phone_number_enc = excluded.phone_number_enc, phone_hash = excluded.phone_hash,
      phone_last4 = excluded.phone_last4, phone_verified = true, phone_verified_at = now(), updated_at = now()`;
  return { status: "verified", masked: maskPhone(String(row["phone_last4"])) };
}

export async function removePhone(userId: string): Promise<void> {
  await sql`delete from public.user_phone_numbers where user_id = ${userId}`;
  await sql`update public.phone_otp_codes set consumed_at = now() where user_id = ${userId} and consumed_at is null`;
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
  const rows = (await sql`select * from public.phone_otp_codes where phone_hash = ${phoneHash}
    and consumed_at is null and expires_at > now() order by created_at desc limit 1`) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return false;
  const userId = row["user_id"] as string;
  if ((await keyedHash(`${userId}:${code}`, secret())) !== row["code_hash"]) return false;
  await sql`update public.phone_otp_codes set consumed_at = now() where id = ${row["id"] as string}`;
  await sql`insert into public.user_phone_numbers (user_id, phone_number_enc, phone_hash, phone_last4, phone_verified, phone_verified_at)
    values (${userId}, ${row["phone_number_enc"] as string}, ${phoneHash}, ${row["phone_last4"] as string}, true, now())
    on conflict (user_id) do update set phone_number_enc = excluded.phone_number_enc, phone_hash = excluded.phone_hash,
      phone_last4 = excluded.phone_last4, phone_verified = true, phone_verified_at = now(), updated_at = now()`;
  return true;
}

export type PendingPhoneVerification = { id: string; masked: string; createdAt: string; attempts: number };

/** Admin queue: open, unexpired phone codes (never exposes the number or code). */
export async function listPendingPhoneVerifications(limit = 50): Promise<PendingPhoneVerification[]> {
  const rows = (await sql`select id, phone_last4, created_at, attempts from public.phone_otp_codes
    where consumed_at is null and expires_at > now() order by created_at desc limit ${limit}`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r["id"]),
    masked: maskPhone(String(r["phone_last4"])),
    createdAt: new Date(String(r["created_at"])).toISOString(),
    attempts: Number(r["attempts"]),
  }));
}

/** Admin: consume an open code and mark the member's number verified. */
export async function approvePhoneVerification(codeId: string): Promise<boolean> {
  const rows = (await sql`update public.phone_otp_codes set consumed_at = now()
    where id = ${codeId} and consumed_at is null and expires_at > now()
    returning user_id, phone_number_enc, phone_hash, phone_last4`) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return false;
  await sql`insert into public.user_phone_numbers (user_id, phone_number_enc, phone_hash, phone_last4, phone_verified, phone_verified_at)
    values (${row["user_id"] as string}, ${row["phone_number_enc"] as string}, ${row["phone_hash"] as string}, ${row["phone_last4"] as string}, true, now())
    on conflict (user_id) do update set phone_number_enc = excluded.phone_number_enc, phone_hash = excluded.phone_hash,
      phone_last4 = excluded.phone_last4, phone_verified = true, phone_verified_at = now(), updated_at = now()`;
  return true;
}
