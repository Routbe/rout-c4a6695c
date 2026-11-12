// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptLedgerEvent, encryptLedgerEvent, generateLedgerKeys, unlockLedgerKey } from "./crypto";

describe("asymmetric ledger", () => {
  it("server encrypts with the public key but cannot decrypt with it", async () => {
    const keys = await generateLedgerKeys();
    const ciphertext = await encryptLedgerEvent(keys.publicKey, { event_type: "app_login", app_name: "App X", scopes: ["openid"] });
    expect(ciphertext).not.toContain("App X");
    const serverKey = await crypto.subtle.importKey("jwk", keys.publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    await expect(decryptLedgerEvent(serverKey, ciphertext)).rejects.toThrow();
    expect(await decryptLedgerEvent(keys.privateKey, ciphertext)).toEqual({ event_type: "app_login", app_name: "App X", scopes: ["openid"] });
    expect(keys.publicKey.d).toBeUndefined();
  }, 15000);
  it("recovery envelope unlocks locally, wrong recovery code cannot", async () => {
    const keys = await generateLedgerKeys();
    const unlocked = await unlockLedgerKey(keys.envelopes[0], keys.keyId, keys.recoveryCode);
    expect(unlocked.extractable).toBe(false);
    await expect(unlockLedgerKey(keys.envelopes[0], keys.keyId, `ROUT-RCVR-${"0".repeat(64)}`)).rejects.toThrow();
    const ciphertext = await encryptLedgerEvent(keys.publicKey, { event_type: "login" });
    expect(await decryptLedgerEvent(unlocked, ciphertext)).toEqual({ event_type: "login" });
  }, 15000);
  it("independent PRF envelope unlocks the same private key", async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32));
    const keys = await generateLedgerKeys(prf);
    const unlocked = await unlockLedgerKey(keys.envelopes[1], keys.keyId, prf);
    expect(await decryptLedgerEvent(unlocked, await encryptLedgerEvent(keys.publicKey, { app: "Y" }))).toEqual({ app: "Y" });
    await expect(unlockLedgerKey(keys.envelopes[1], keys.keyId, crypto.getRandomValues(new Uint8Array(32)))).rejects.toThrow();
  }, 15000);
  it("reset generates a new key without recovering historical data", async () => {
    const old = await generateLedgerKeys();
    const next = await generateLedgerKeys();
    expect(next.keyId).not.toBe(old.keyId);
    await expect(decryptLedgerEvent(next.privateKey, await encryptLedgerEvent(old.publicKey, { old: true }))).rejects.toThrow();
  }, 15000);
});