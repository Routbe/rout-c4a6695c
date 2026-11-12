import { describe, expect, it } from "vitest";
import { redirectUriSchema, clientSchema } from "@/lib/oauth/console-schemas";
import { hashClientSecret, verifyClientSecret, generateClientSecret } from "@/lib/oauth/client-secret";
import { evaluateOtp, OTP_TTL_MS, OTP_MAX_ATTEMPTS, normalizePhone, generateOtp } from "@/lib/phone/otp-rules";
import { decideRateLimit, tooManyRequests } from "@/lib/rate-limit-rules";
import { securityHeaders, sessionCookieProblems } from "@/lib/security-headers";

describe("redirect URIs", () => {
  it("accepts https and localhost http", () => {
    expect(redirectUriSchema.safeParse("https://a.be/cb").success).toBe(true);
    expect(redirectUriSchema.safeParse("http://localhost:3000/cb").success).toBe(true);
  });
  it("rejects http, wildcard and fragment", () => {
    expect(redirectUriSchema.safeParse("http://a.be/cb").success).toBe(false);
    expect(redirectUriSchema.safeParse("https://*.a.be/cb").success).toBe(false);
    expect(redirectUriSchema.safeParse("https://a.be/cb#x").success).toBe(false);
  });
  it("allows at most 10", () => {
    const base = { name: "App", redirectUris: [] as string[], scopes: ["openid"] };
    const uris = (n: number) => Array.from({ length: n }, (_, i) => `https://a.be/${i}`);
    expect(clientSchema.safeParse({ ...base, redirectUris: uris(10) }).success).toBe(true);
    expect(clientSchema.safeParse({ ...base, redirectUris: uris(11) }).success).toBe(false);
  });
});

describe("client secret", () => {
  it("stores only a peppered hash and verifies it", async () => {
    const secret = generateClientSecret();
    const hash = await hashClientSecret(secret, "p".repeat(32));
    expect(hash).not.toContain(secret);
    expect(await verifyClientSecret(secret, hash, "p".repeat(32))).toBe(true);
    expect(await verifyClientSecret(secret + "x", hash, "p".repeat(32))).toBe(false);
    expect(await verifyClientSecret(secret, hash, "q".repeat(32))).toBe(false);
  });
});

describe("phone codes", () => {
  const now = 1_000_000;
  it("expire after 10 minutes", () => {
    expect(OTP_TTL_MS).toBe(600_000);
    expect(evaluateOtp({ expiresAt: now, attempts: 0, consumed: false }, now, true)).toBe("expired");
  });
  it("allow at most 5 attempts", () => {
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(evaluateOtp({ expiresAt: now + 1, attempts: 4, consumed: false }, now, true)).toBe("ok");
    expect(evaluateOtp({ expiresAt: now + 1, attempts: 5, consumed: false }, now, true)).toBe("too_many_attempts");
  });
  it("are 6 digits and numbers are normalized", () => {
    expect(generateOtp()).toMatch(/^\d{6}$/);
    expect(normalizePhone("+32", "0470 12 34 56")).toBe("+32470123456");
    expect(normalizePhone("+32", "12")).toBeNull();
  });
});

describe("rate limits", () => {
  it("returns 429 with Retry-After past the limit", () => {
    const rule = { limit: 3, windowSec: 60 };
    expect(decideRateLimit(3, rule, 0).ok).toBe(true);
    const d = decideRateLimit(4, rule, 10_000);
    expect(d).toEqual({ ok: false, retryAfter: 50 });
    const res = tooManyRequests(d.retryAfter);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("50");
  });
});

describe("security headers", () => {
  it("sets HSTS on https, COOP and frame-ancestors", () => {
    const h = securityHeaders(true);
    expect(h["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("unsafe-none");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'self' https://rout.be");
    expect(securityHeaders(false)["Strict-Transport-Security"]).toBeUndefined();
  });
  it("keeps OAuth popups connected on sign-in and settings pages", () => {
    for (const path of ["/auth", "/auth/continue", "/settings", "/settings/security"]) {
      expect(securityHeaders(true, path)["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    }
  });
  it("flags weak session cookies", () => {
    expect(sessionCookieProblems("rout_session=a; Path=/; HttpOnly; Secure; SameSite=Lax")).toEqual([]);
    expect(sessionCookieProblems("rout_session=a; Path=/")).toEqual(["HttpOnly", "Secure", "SameSite=Lax"]);
  });
});

import { decideSlidingLimit, slidingEstimate } from "@/lib/rate-limit-rules";
describe("sliding window rate limit", () => {
  const rule = { limit: 10, windowSec: 60 };
  it("counts the previous window for its remaining overlap", () => {
    // 15 s into the window: 75% of the previous 8 hits still count
    expect(slidingEstimate(8, 3, 15_000, 60)).toBe(9);
  });
  it("blocks a burst across the window boundary that fixed windows allowed", () => {
    expect(decideSlidingLimit(10, 1, rule, 1_000).ok).toBe(false);
  });
  it("allows once the previous window's weight has faded", () => {
    expect(decideSlidingLimit(10, 1, rule, 59_000).ok).toBe(true);
  });
});

describe("public page CSP", () => {
  it("blocks third-party scripts and plugins on public profiles", () => {
    const csp = securityHeaders(true, "/jan")["Content-Security-Policy"] ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*\shttps:(\s|;|$)/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});
