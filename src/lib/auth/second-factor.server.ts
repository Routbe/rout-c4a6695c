/**
 * Server-side facts for the second sign-in step and the admin 2FA requirement.
 * Works on Better Auth user ids (`neon_auth.user.id`) and maps them onto
 * `public.users` only where member data (phone, roles) lives.
 */
import { sql } from "@/lib/neon";
import { smsSecondFactorAvailable, type SecondFactorFacts } from "./sign-in-policy";

type Row = Record<string, unknown>;

/** `public.users.id` for a Better Auth user id, or null. */
export async function memberIdForAuthUser(authUserId: string): Promise<string | null> {
  const rows = (await sql`select id::text as id from public.users
    where auth_user_id::text = ${authUserId} or user_metadata->>'neon_auth_id' = ${authUserId} limit 1`) as Row[];
  return typeof rows[0]?.["id"] === "string" ? (rows[0]["id"] as string) : null;
}

/** What the member can use as a second step. Never throws: unknown facts count as absent. */
export async function secondFactorFacts(authUserId: string): Promise<SecondFactorFacts> {
  const facts: SecondFactorFacts = { totp: false, smsTo: null, passkey: false, backupCodes: false };
  try {
    const rows = (await sql`select
        exists (select 1 from neon_auth."twoFactor" t where t."userId"::text = ${authUserId} and coalesce(t.verified, true) and t.secret is not null) as totp,
        exists (select 1 from neon_auth."twoFactor" t where t."userId"::text = ${authUserId} and t."backupCodes" is not null) as backup,
        exists (select 1 from neon_auth.passkey p where p."userId"::text = ${authUserId}) as passkey`) as Row[];
    facts.totp = rows[0]?.["totp"] === true;
    facts.backupCodes = rows[0]?.["backup"] === true;
    facts.passkey = rows[0]?.["passkey"] === true;
  } catch (e) {
    console.error("[2fa] factor lookup failed", e instanceof Error ? e.message : e);
  }
  try {
    const memberId = await memberIdForAuthUser(authUserId);
    if (memberId) {
      const { phoneStatus } = await import("@/lib/phone/phone-otp.server");
      const phone = await phoneStatus(memberId);
      if (smsSecondFactorAvailable(phone.verified, phone.configured)) facts.smsTo = phone.masked;
    }
  } catch (e) {
    console.error("[2fa] phone lookup failed", e instanceof Error ? e.message : e);
  }
  return facts;
}

/** Sends a sign-in/2FA code by SMS to the member's verified number. Returns false when impossible. */
export async function sendSecondFactorSms(authUserId: string, code: string): Promise<boolean> {
  const memberId = await memberIdForAuthUser(authUserId);
  if (!memberId) return false;
  const rows = (await sql`select phone_number_enc from public.user_phone_numbers
    where user_id = ${memberId} and phone_verified limit 1`) as Row[];
  const stored = rows[0]?.["phone_number_enc"];
  const key = process.env["PHONE_ENCRYPTION_KEY"] ?? "";
  if (typeof stored !== "string" || !key) return false;
  const { getSmsSender } = await import("@/lib/phone/sms-provider.server");
  const sender = getSmsSender();
  if (!sender) return false;
  const { decryptText } = await import("@/lib/phone/phone-crypto");
  const phone = await decryptText(stored, key);
  await sender.send(phone, `Je ROUT-aanmeldcode: ${code}. Geldig 5 minuten. Deel deze code met niemand, ook niet met ROUT.`);
  return true;
}

/** True when the Better Auth user holds the admin role or any admin permission. */
export async function authUserIsAdmin(authUserId: string): Promise<boolean> {
  const memberId = await memberIdForAuthUser(authUserId);
  if (!memberId) return false;
  const rows = (await sql`select 1 from public.user_roles where user_id = ${memberId} and role::text = 'admin'
    union all select 1 from public.admin_permissions where user_id = ${memberId} limit 1`) as Row[];
  return rows.length > 0;
}

/** True when the member (public.users id) has 2FA switched on in Better Auth. */
export async function memberTwoFactorEnabled(memberId: string): Promise<boolean> {
  const rows = (await sql`select au."twoFactorEnabled" as on from public.users u
    join neon_auth."user" au on au.id::text = coalesce(u.auth_user_id::text, u.user_metadata->>'neon_auth_id')
    where u.id = ${memberId} limit 1`) as Row[];
  return rows[0]?.["on"] === true;
}
