// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptLedgerEvent, generateLedgerKeys } from "./crypto";

describe("ledger memory on random source failure", () => {
  afterEach(() => vi.restoreAllMocks());
  it("wipes serialized plaintext when key randomness fails", async () => {
    const { publicKey } = await generateLedgerKeys();
    const encoding = vi.spyOn(TextEncoder.prototype, "encode");
    vi.spyOn(crypto, "getRandomValues").mockImplementation(() => { throw new Error("random source unavailable"); });
    await expect(encryptLedgerEvent(publicKey, { note: "sensitive" })).rejects.toThrow("random source unavailable");
    const at = encoding.mock.calls.findIndex(([text]) => text === JSON.stringify({ note: "sensitive" }));
    if (at < 0) throw new Error("Payload was not serialized");
    const buffer = encoding.mock.results[at].value as Uint8Array;
    expect([...buffer]).toEqual(Array(buffer.length).fill(0));
  });
});