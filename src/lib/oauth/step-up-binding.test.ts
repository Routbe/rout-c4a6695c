import { describe, expect, it } from "vitest";
import {
  STEP_UP_TTL_SEC,
  authorizationRequestId,
  challengeUsable,
  checkClientData,
  classifyVerify,
  counterAccepted,
  deriveOtpKey,
  otpHash,
} from "./step-up-binding";

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const req = { clientId: "app_1", redirectUri: "https://app.example/cb", state: "s1", nonce: "n1", codeChallenge: "c".repeat(43) };
const SECRET = "x".repeat(40);

describe("step-up OTP storage", () => {
  it("is valid for at most 5 minutes", () => {
    expect(STEP_UP_TTL_SEC).toBeLessThanOrEqual(300);
  });

  it("stores a keyed v2$ HMAC, not a plain hash", async () => {
    const key = await deriveOtpKey(SECRET);
    const h = await otpHash(key, "u", "app_1", "r", "123456");
    expect(h.startsWith("v2$")).toBe(true);
    const other = await otpHash(await deriveOtpKey("y".repeat(40)), "u", "app_1", "r", "123456");
    expect(other).not.toBe(h);
  });

  it("refuses a missing or short server secret", async () => {
    await expect(deriveOtpKey("")).rejects.toThrow("step_up_secret_missing");
  });

  it("binds the code to the authorization request", async () => {
    const key = await deriveOtpKey(SECRET);
    const a = await otpHash(key, "u", "app_1", await authorizationRequestId(req), "123456");
    const b = await otpHash(key, "u", "app_1", await authorizationRequestId({ ...req, state: "other" }), "123456");
    expect(a).not.toBe(b);
  });
});

describe("request id", () => {
  it("differs per client, redirect, state, nonce and PKCE challenge", async () => {
    const base = await authorizationRequestId(req);
    for (const change of [{ clientId: "app_2" }, { redirectUri: "https://evil.example/cb" }, { state: "x" }, { nonce: "x" }, { codeChallenge: "d".repeat(43) }]) {
      expect(await authorizationRequestId({ ...req, ...change })).not.toBe(base);
    }
    expect(await authorizationRequestId({ ...req })).toBe(base);
  });
});

describe("attempt exhaustion", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  const future = "2026-10-31T12:04:00Z";
  it("a matching guarded update is ok, a non-matching one is wrong", () => {
    expect(classifyVerify({ ok: true }, { attempts: 0, expiresAt: future }, now)).toBe("ok");
    expect(classifyVerify({ ok: false }, { attempts: 0, expiresAt: future }, now)).toBe("wrong");
  });
  it("locked once the attempt limit is reached (the guarded update matched nothing)", () => {
    expect(classifyVerify(null, { attempts: 5, expiresAt: future }, now)).toBe("locked");
  });
  it("expired codes are reported as expired", () => {
    expect(classifyVerify(null, { attempts: 0, expiresAt: "2026-10-31T11:59:59Z" }, now)).toBe("expired");
  });
  it("missing when there is no open code", () => {
    expect(classifyVerify(null, null, now)).toBe("missing");
  });
});

describe("passkey challenge", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  it("expired challenge is refused", () => {
    expect(challengeUsable({ expiresAt: "2026-10-31T11:59:00Z", consumedAt: null }, now)).toBe(false);
  });
  it("a used challenge cannot be reused", () => {
    expect(challengeUsable({ expiresAt: "2026-10-31T12:04:00Z", consumedAt: "2026-10-31T11:59:30Z" }, now)).toBe(false);
    expect(challengeUsable({ expiresAt: "2026-10-31T12:04:00Z", consumedAt: null }, now)).toBe(true);
  });
  it("rejects an assertion from another origin", () => {
    const cd = b64({ type: "webauthn.get", challenge: "abc", origin: "https://evil.example" });
    expect(checkClientData(cd, { challenge: "abc", origin: "https://rout.be" })).toEqual({ ok: false, reason: "origin" });
  });
  it("rejects an assertion for another challenge", () => {
    const cd = b64({ type: "webauthn.get", challenge: "old", origin: "https://rout.be" });
    expect(checkClientData(cd, { challenge: "abc", origin: "https://rout.be" })).toEqual({ ok: false, reason: "challenge" });
  });
  it("rejects a registration response used as assertion", () => {
    const cd = b64({ type: "webauthn.create", challenge: "abc", origin: "https://rout.be" });
    expect(checkClientData(cd, { challenge: "abc", origin: "https://rout.be" })).toEqual({ ok: false, reason: "type" });
  });
  it("accepts the exact challenge and origin", () => {
    const cd = b64({ type: "webauthn.get", challenge: "abc", origin: "https://rout.be" });
    expect(checkClientData(cd, { challenge: "abc", origin: "https://rout.be" })).toEqual({ ok: true });
  });
  it("counter must grow (cloned authenticator detection)", () => {
    expect(counterAccepted(5, 5)).toBe(false);
    expect(counterAccepted(5, 6)).toBe(true);
    expect(counterAccepted(0, 0)).toBe(true);
  });
});
