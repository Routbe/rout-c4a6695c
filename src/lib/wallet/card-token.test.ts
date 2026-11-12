import { describe, expect, it } from "vitest";
import { SECURE_TTL_MS, signSecureToken, verifySecureToken } from "./card-token";

const key = new Uint8Array(32).fill(7);
const other = new Uint8Array(32).fill(8);
const now = 1_800_000_000_000;

describe("secure card token v2", () => {
  it("verifies a fresh token", async () => {
    const { token, payload } = await signSecureToken(key, { handle: "@Le.na", space: "alias", card: "0123456789abcdef", now });
    const r = await verifySecureToken(key, token, now + 1000);
    expect(r).toEqual({ ok: true, payload });
    expect(payload.h).toBe("le.na");
  });
  it("expires after exactly 60 seconds", async () => {
    const { token } = await signSecureToken(key, { handle: "lena", space: "root", card: "0123456789abcdef", now });
    expect((await verifySecureToken(key, token, now + SECURE_TTL_MS)).ok).toBe(true);
    expect(await verifySecureToken(key, token, now + SECURE_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
  });
  it("rejects a token signed with another key", async () => {
    const { token } = await signSecureToken(other, { handle: "lena", space: "root", card: "0123456789abcdef", now });
    expect(await verifySecureToken(key, token, now)).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects a tampered payload", async () => {
    const { token } = await signSecureToken(key, { handle: "lena", space: "root", card: "0123456789abcdef", now });
    const [, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ v: 2, h: "admin", s: "r", iat: now, exp: now + SECURE_TTL_MS, n: "A".repeat(22) })).replace(/=+$/, "");
    expect(await verifySecureToken(key, `${forged}.${sig}`, now)).toEqual({ ok: false, reason: "invalid" });
  });
  it("gives every token a unique nonce", async () => {
    const a = await signSecureToken(key, { handle: "lena", space: "root", card: "0123456789abcdef", now });
    const b = await signSecureToken(key, { handle: "lena", space: "root", card: "0123456789abcdef", now });
    expect(a.payload.n).not.toBe(b.payload.n);
  });
});
