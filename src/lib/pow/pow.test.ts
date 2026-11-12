// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POW_BITS, leadingZeroBits, sha256Hex, signPowChallenge, solvePow, verifyPow } from "./pow";

const SECRET = "x".repeat(40);
const now = 1_800_000_000;
const nonce = new Uint8Array(16).fill(7);

describe("scoped proof-of-work", () => {
  it("vault and workspace demand 20 zero bits", () => {
    expect(POW_BITS.vault).toBe(20);
    expect(POW_BITS.workspace).toBe(20);
  });

  it("accepts a real solution and rejects weak, foreign, expired or forged ones", async () => {
    const challenge = await signPowChallenge(SECRET, "vault", now, nonce);
    const solution = await solvePow(challenge);
    expect(leadingZeroBits(await sha256Hex(`${challenge}:${solution}`))).toBeGreaterThanOrEqual(20);
    expect((await verifyPow(SECRET, "vault", challenge, solution, now)).ok).toBe(true);
    expect(await verifyPow(SECRET, "workspace", challenge, solution, now)).toEqual({ ok: false, reason: "wrong_scope" });
    expect(await verifyPow(SECRET, "vault", challenge, solution, now + 601)).toEqual({ ok: false, reason: "expired" });
    expect(await verifyPow("y".repeat(40), "vault", challenge, solution, now)).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyPow(SECRET, "vault", "", "", now)).toEqual({ ok: false, reason: "missing" });
    // A weakened copy (bits field edited) breaks the signature.
    const forged = challenge.replace(".20.", ".1.");
    expect((await verifyPow(SECRET, "vault", forged, "0", now)).ok).toBe(false);
  }, 60_000);
});
