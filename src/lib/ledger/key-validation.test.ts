// @vitest-environment node
import { expect, it } from "vitest";
import { generateLedgerKeys } from "./crypto";
import { ledgerKeyInputSchema, ledgerPublicKeySchema } from "./key-validation";
it("accepts the client-generated RSA-3072 public key and recovery envelope", async () => {
  const keys = await generateLedgerKeys();
  expect(ledgerKeyInputSchema.safeParse({ publicKey: keys.publicKey, envelopes: keys.envelopes, expectedKeyId: null }).success).toBe(true);
}, 15000);
it("rejects private-key material and weak modulus at the upload boundary", () => {
  expect(ledgerPublicKeySchema.safeParse({ kty: "RSA", e: "AQAB", n: "A".repeat(512), d: "private" }).success).toBe(false);
  expect(ledgerPublicKeySchema.safeParse({ kty: "RSA", e: "AQAB", n: "A".repeat(256) }).success).toBe(false);
});
it("rejects duplicate recovery envelopes and malformed AES nonces", async () => {
  const keys = await generateLedgerKeys();
  expect(ledgerKeyInputSchema.safeParse({ publicKey: keys.publicKey, envelopes: [keys.envelopes[0], keys.envelopes[0]], expectedKeyId: null }).success).toBe(false);
  expect(ledgerKeyInputSchema.safeParse({ publicKey: keys.publicKey, envelopes: [{ ...keys.envelopes[0], iv: "" }], expectedKeyId: null }).success).toBe(false);
}, 15000);