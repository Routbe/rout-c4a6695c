/**
 * Ad-hoc, in-memory rate limiting for privileged admin endpoints.
 *
 * The backend has no shared rate-limiting primitive, so this is a per-worker
 * sliding window: good enough to stop an accidental export loop or a runaway
 * client from hammering the database, not a security boundary.
 */
type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`RATE_LIMITED: too many requests — wait ${retryAfterSeconds}s before trying again.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Throws {@link RateLimitError} once `limit` calls happened inside `windowMs`
 * for the same key (usually `<endpoint>:<userId>`).
 */
export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const hit = buckets.get(key);

  if (!hit || now >= hit.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic cleanup keeps the map from growing without bound.
    if (buckets.size > 500) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    return;
  }

  hit.count += 1;
  if (hit.count > limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((hit.resetAt - now) / 1000)));
  }
}

/** True when the same key has not been seen inside the window (throttled logging). */
export function shouldSample(key: string, windowMs: number): boolean {
  const now = Date.now();
  const hit = buckets.get(`sample:${key}`);
  if (hit && now < hit.resetAt) return false;
  buckets.set(`sample:${key}`, { count: 1, resetAt: now + windowMs });
  return true;
}
