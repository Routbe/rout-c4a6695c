import { sql } from "@/lib/neon";

/**
 * E-mailcode (6 cijfers) voor Bluesky- en Mastodon-aanmeldingen.
 *
 * Een extern account wordt nooit aan een e-mailadres gehangen op basis van
 * enkel wat de gebruiker intypt: eerst moet de code uit de mailbox kloppen.
 * Codes zijn gehasht, 10 minuten geldig, max. 3 pogingen, daarna 15 min slot.
 */

export const FEDI_PENDING_COOKIE = "rout_fedi_pending";
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_LOCK_MS = 15 * 60 * 1000;

export type FediProvider = "bluesky" | "mastodon";

export interface PendingFediLogin {
  provider: FediProvider;
  accountId: string;
  handle: string;
  next: string;
}

export function encodePending(p: PendingFediLogin): string {
  return [p.provider, p.accountId, p.handle, p.next].join("|");
}

export function decodePending(raw: string | null): PendingFediLogin | null {
  if (!raw) return null;
  const [provider, accountId, handle, next] = raw.split("|");
  if ((provider !== "bluesky" && provider !== "mastodon") || !accountId || !handle) return null;
  return { provider, accountId, handle, next: next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard" };
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gelijke-tijd-vergelijking van twee hex-strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0]! % 1_000_000).padStart(6, "0");
}

type Row = { email: string; code_hash: string; attempts: number; locked_until: string | null; expires_at: string };

async function readRow(key: string): Promise<Row | null> {
  const rows = (await sql`
    select email, code_hash, attempts, locked_until, expires_at
      from public.fediverse_email_otp where pending_key = ${key}`) as Row[];
  return rows[0] ?? null;
}

export class OtpError extends Error {}

/** Maakt (of vervangt) de code en verstuurt ze. Een slot blijft gerespecteerd. */
export async function issueCode(pendingRaw: string, email: string): Promise<void> {
  const key = await sha256(pendingRaw);
  const existing = await readRow(key);
  if (existing?.locked_until && Date.parse(existing.locked_until) > Date.now()) {
    throw new OtpError("Te veel pogingen. Probeer het over 15 minuten opnieuw.");
  }
  const code = generateCode();
  const codeHash = await sha256(`${key}|${email}|${code}`);
  const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await sql`
    insert into public.fediverse_email_otp (pending_key, email, code_hash, attempts, locked_until, expires_at)
    values (${key}, ${email}, ${codeHash}, 0, null, ${expires})
    on conflict (pending_key) do update
      set email = excluded.email, code_hash = excluded.code_hash,
          attempts = 0, locked_until = null, expires_at = excluded.expires_at, created_at = now()`;

  const { sendTransactionalEmail } = await import("@/lib/notifications.server");
  await sendTransactionalEmail({
    to: email,
    subject: `Je ROUT-code: ${code}`,
    category: "system" as never,
    html: `<p>Gebruik deze code om je ROUT-account te bevestigen:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700;font-family:monospace">${code}</p>
<p>De code is 10 minuten geldig. Heb je dit niet aangevraagd? Negeer dan deze e-mail — er wordt niets gekoppeld.</p>`,
    tags: ["fediverse-otp"],
  });
}

/** Controleert de code. Geeft het bevestigde e-mailadres terug. */
export async function verifyCode(pendingRaw: string, code: string): Promise<string> {
  const key = await sha256(pendingRaw);
  const row = await readRow(key);
  if (!row) throw new OtpError("Vraag eerst een code aan.");
  if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
    throw new OtpError("Te veel pogingen. Probeer het over 15 minuten opnieuw.");
  }
  if (Date.parse(row.expires_at) < Date.now()) throw new OtpError("Deze code is verlopen. Vraag een nieuwe aan.");

  const expected = await sha256(`${key}|${row.email}|${code}`);
  if (!safeEqual(expected, row.code_hash)) {
    const attempts = row.attempts + 1;
    const lock = attempts >= OTP_MAX_ATTEMPTS ? new Date(Date.now() + OTP_LOCK_MS).toISOString() : null;
    await sql`update public.fediverse_email_otp
                 set attempts = ${attempts}, locked_until = ${lock}
               where pending_key = ${key}`;
    throw new OtpError(
      lock
        ? "Te veel foute pogingen. Probeer het over 15 minuten opnieuw."
        : `Onjuiste code. Nog ${OTP_MAX_ATTEMPTS - attempts} poging(en).`,
    );
  }
  await sql`delete from public.fediverse_email_otp where pending_key = ${key}`;
  return row.email;
}
