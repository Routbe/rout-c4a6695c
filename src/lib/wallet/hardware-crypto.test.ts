import { describe, expect, it } from "vitest";
import { b64urlEncode, challengeMessage, normalizeNfcUid, verifyChipSignature } from "./hardware-crypto";

const hid = "0b8c2a3e-6a7d-4d2f-9f6b-1c2d3e4f5a6b";

async function chip(alg: "Ed25519" | "P-256") {
  const params = alg === "Ed25519" ? { name: "Ed25519" } : { name: "ECDSA", namedCurve: "P-256" };
  const pair = (await crypto.subtle.generateKey(params, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const sign = async (msg: Uint8Array) =>
    b64urlEncode(new Uint8Array(await crypto.subtle.sign(alg === "Ed25519" ? { name: "Ed25519" } : { name: "ECDSA", hash: "SHA-256" }, pair.privateKey, msg as BufferSource)));
  return { pub, sign };
}

describe("hardware challenge-response", () => {
  for (const alg of ["Ed25519", "P-256"] as const) {
    it(`${alg}: accepts the chip's signature over the nonce`, async () => {
      const c = await chip(alg);
      const msg = challengeMessage(hid, "nonce-1");
      expect(await verifyChipSignature(alg, c.pub, msg, await c.sign(msg))).toBe(true);
    });
    it(`${alg}: rejects a signature over another nonce`, async () => {
      const c = await chip(alg);
      const sig = await c.sign(challengeMessage(hid, "old-nonce"));
      expect(await verifyChipSignature(alg, c.pub, challengeMessage(hid, "nonce-2"), sig)).toBe(false);
    });
  }
  it("rejects garbage without throwing", async () => {
    expect(await verifyChipSignature("Ed25519", "abc", challengeMessage(hid, "n"), "zzz")).toBe(false);
  });
  it("normalises NFC UIDs", () => {
    expect(normalizeNfcUid("04:a2:3b:1c:9d:80:00")).toBe("04:A2:3B:1C:9D:80:00");
    expect(normalizeNfcUid("12")).toBeNull();
  });
});
