import { describe, expect, it } from "vitest";
import { evaluateOtp, generateOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from "@/lib/phone/otp-rules";
import { maskEmail } from "@/lib/security-code.server";

describe("six-digit security codes", () => {
  it("always generates exactly six digits", () => {
    for (let i = 0; i < 200; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it("expires after 10 minutes", () => {
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
    const state = { expiresAt: 1000, attempts: 0, consumed: false };
    expect(evaluateOtp(state, 1000, true)).toBe("expired");
    expect(evaluateOtp(state, 999, true)).toBe("ok");
  });

  it("locks after 5 failed attempts", () => {
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(evaluateOtp({ expiresAt: 9e15, attempts: 5, consumed: false }, 0, true)).toBe("too_many_attempts");
    expect(evaluateOtp({ expiresAt: 9e15, attempts: 4, consumed: false }, 0, true)).toBe("ok");
  });

  it("is single use", () => {
    expect(evaluateOtp({ expiresAt: 9e15, attempts: 0, consumed: true }, 0, true)).toBe("consumed");
  });

  it("masks the e-mail it was sent to", () => {
    expect(maskEmail("maximilien@rout.be")).toBe("ma••••••••@rout.be");
  });
});
