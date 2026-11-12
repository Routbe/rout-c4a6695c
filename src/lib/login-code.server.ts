import { sql } from "@/lib/neon";
import { hitRateLimit, sha256Hex } from "@/lib/rate-limit-db.server";

/** 6-digit code that redeems the same magic link (db/72). */

export const LOGIN_CODE_TTL_SEC = 15 * 60;

export function newLoginCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, "0");
}

const norm = (email: string) => email.trim().toLowerCase();

/** Stores the code; returns it, or null when storing failed (mail then carries only the link). */
export async function issueLoginCode(email: string, link: string): Promise<string | null> {
  try {
    const code = newLoginCode();
    const e = await sha256Hex(norm(email));
    await sql`delete from public.login_codes where email_hash = ${e} or expires_at < now()`;
    await sql`insert into public.login_codes (email_hash, code_hash, link, expires_at)
      values (${e}, ${await sha256Hex(`${e}:${code}`)}, ${link}, now() + make_interval(secs => ${LOGIN_CODE_TTL_SEC}))`;
    // Sign-in codes never reach the logs, not even in preview.
    return code;
  } catch (err) {
    console.error("[login-code] issue failed", (err as Error)?.message);
    return null;
  }
}

/** Single use: returns the magic link when the code matches, else a reason. */
export async function redeemLoginCode(
  email: string,
  code: string,
): Promise<{ ok: true; link: string } | { ok: false; reason: "invalid" | "rate_limited" }> {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(email))) return { ok: false, reason: "invalid" };
  const limit = await hitRateLimit("login-code", norm(email), { limit: 5, windowSec: 600 });
  if (!limit.ok) return { ok: false, reason: "rate_limited" };
  const e = await sha256Hex(norm(email));
  const rows = (await sql`delete from public.login_codes
    where email_hash = ${e} and code_hash = ${await sha256Hex(`${e}:${clean}`)} and expires_at > now()
    returning link`) as { link: string }[];
  const link = rows[0]?.link;
  return link ? { ok: true, link } : { ok: false, reason: "invalid" };
}
