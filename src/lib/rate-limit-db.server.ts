import { sql } from "@/lib/neon";
import { decideSlidingLimit, windowStartMs, type RateRule } from "@/lib/rate-limit-rules";

/**
 * Database-backed limits (db/64) so every server instance shares one counter.
 * A database failure lets the request through with a warning: a broken
 * counter must never lock everybody out of sign-in.
 */

export async function sha256Hex(value: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hitRateLimit(name: string, subject: string, rule: RateRule, options: { failClosed?: boolean } = {}) {
  const now = Date.now();
  try {
    // Keyed, purpose-separated and rotated daily: an IP cannot be recovered from
    // a bucket, and buckets of different limits cannot be linked to each other.
    const { rateLimitKey } = await import("@/lib/qa/privacy-keys.server");
    const bucket = `${name}:${await rateLimitKey(name, subject, now)}`;
    const startMs = windowStartMs(now, rule.windowSec);
    const start = new Date(startMs).toISOString();
    const prevStart = new Date(startMs - rule.windowSec * 1000).toISOString();
    const rows = (await sql`with up as (insert into public.rate_limits (bucket, window_start, hits)
      values (${bucket}, ${start}, 1)
      on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
      returning hits)
      select (select hits from up) as hits,
             coalesce((select hits from public.rate_limits where bucket = ${bucket} and window_start = ${prevStart}), 0) as prev`) as { hits: number; prev: number }[];
    if (Math.random() < 0.01) {
      void sql`delete from public.rate_limits where window_start < now() - interval '1 day'`.catch(() => {});
    }
    return decideSlidingLimit(Number(rows[0]?.prev ?? 0), Number(rows[0]?.hits ?? 1), rule, now);
  } catch (error) {
    console.warn(`[rate-limit] ${name} skipped:`, (error as Error)?.message);
    return options.failClosed ? { ok: false, retryAfter: rule.windowSec } : { ok: true, retryAfter: 0 };
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** Shared (all instances) sliding-window guard for public HTTP endpoints; null = allowed. */
export async function guardShared(request: Request, name: string, rule: RateRule): Promise<Response | null> {
  const r = await hitRateLimit(name, clientIp(request), rule);
  if (r.ok) return null;
  const { tooManyRequests } = await import("@/lib/rate-limit-rules");
  return tooManyRequests(r.retryAfter);
}
