import { afterEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  digest: vi.fn(async () => "ab".repeat(32)),
  generate: vi.fn(),
  unlock: vi.fn(),
  current: vi.fn(),
}));
vi.mock("@/lib/crypto-enclave/client", () => ({ captureEnclaveScope: () => ({ assertCurrent: mocked.current }), enclave: {
  hash: { sha256Hex: mocked.digest }, ledger: { generate: mocked.generate, unlock: mocked.unlock },
} }));
import { generateLedgerWithPasskey, unlockLedgerWithPasskey } from "./prf";

function passkey(output: Uint8Array) {
  const get = vi.fn(async () => ({ rawId: new Uint8Array([1, 2]).buffer, getClientExtensionResults: () => ({ prf: { results: { first: output.buffer } } }) }));
  vi.stubGlobal("navigator", { credentials: { get } });
  return get;
}

describe("passkey secret ownership", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it("returns only a draft and credential id after moving PRF bytes to the worker", async () => {
    const output = new Uint8Array(32).fill(9);
    passkey(output);
    const draft = { keyId: "key-id", publicKey: {}, recoveryCode: "displayed-recovery", envelopes: [] };
    mocked.generate.mockImplementationOnce(async (input: Uint8Array) => {
      expect(input).toBeInstanceOf(Uint8Array);
      expect(input[0]).toBe(9);
      structuredClone(input, { transfer: [input.buffer] });
      return draft;
    });
    expect(await generateLedgerWithPasskey()).toEqual({ draft, credentialId: "AQI=" });
    expect(output.byteLength).toBe(0);
  });
  it("wipes authenticator bytes when worker setup rejects without transferring", async () => {
    const output = new Uint8Array(32).fill(42);
    passkey(output);
    mocked.unlock.mockRejectedValueOnce(new Error("unavailable"));
    await expect(unlockLedgerWithPasskey("key", { v: 1, source: "prf", salt: "", iv: "", ciphertext: "" })).rejects.toThrow("unavailable");
    expect([...output]).toEqual(Array(32).fill(0));
  });
  it("wipes a passkey response arriving after an account transition without generating a key", async () => {
    const output = new Uint8Array(32).fill(89);
    passkey(output);
    mocked.current.mockImplementationOnce(() => { throw new Error("stale account"); });
    await expect(generateLedgerWithPasskey()).rejects.toThrow("stale account");
    expect(mocked.generate).not.toHaveBeenCalled();
    expect([...output]).toEqual(Array(32).fill(0));
  });
  it("does not unlock after the caller locks while WebAuthn is pending", async () => {
    const output = new Uint8Array(32).fill(92);
    let current = true;
    const caller = { signal: new AbortController().signal, assertCurrent: () => { if (!current) throw new Error("locked"); } };
    vi.stubGlobal("navigator", { credentials: { get: async () => {
      current = false;
      return { rawId: new Uint8Array([1]).buffer, getClientExtensionResults: () => ({ prf: { results: { first: output.buffer } } }) };
    } } });
    await expect(unlockLedgerWithPasskey("key", { v: 1, source: "prf", salt: "", iv: "", ciphertext: "" }, undefined, caller)).rejects.toThrow("locked");
    expect(mocked.unlock).not.toHaveBeenCalled();
    expect([...output]).toEqual(Array(32).fill(0));
  });
});