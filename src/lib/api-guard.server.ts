/**
 * Misbruikbescherming voor publieke HTTP-endpoints.
 *
 * Per worker-instantie een schuivend venster per IP + endpoint. Het houdt
 * scrapers, botspam en per ongeluk doorgeslagen clients tegen zonder externe
 * afhankelijkheid; het is bewust geen vervanging voor de auth-controles in de
 * handlers zelf.
 */
import { enforceRateLimit, RateLimitError } from "./rate-limit.server";

/** Beste beschikbare client-IP achter de edge-proxy. */
export function clientIp(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? "";
  if (forwarded) return forwarded;
  const chain = headers.get("x-forwarded-for") ?? "";
  return chain.split(",")[0]?.trim() || "unknown";
}

/**
 * Geeft een 429-Response terug zodra het venster vol is, anders `null` zodat de
 * handler gewoon doorgaat.
 */
export function guardRequest(
  request: Request,
  endpoint: string,
  limit: number,
  windowMs: number,
): Response | null {
  try {
    enforceRateLimit(`http:${endpoint}:${clientIp(request)}`, limit, windowMs);
    return null;
  } catch (error) {
    const retryAfter = error instanceof RateLimitError ? error.retryAfterSeconds : 60;
    return new Response("Too many requests", {
      status: 429,
      headers: { "retry-after": String(retryAfter), "cache-control": "no-store" },
    });
  }
}
