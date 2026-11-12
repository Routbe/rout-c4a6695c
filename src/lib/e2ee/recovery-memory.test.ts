// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { b64u } from "./crypto";
import { combineShards, splitSecret } from "./recovery";

describe("recovery buffer ownership", () => {
  afterEach(() => vi.restoreAllMocks());
  it("wipes random Shamir coefficients and encoded shard buffers without changing the input key", () => {
    const random = vi.spyOn(crypto, "getRandomValues");
    const encode = vi.spyOn(b64u, "encode");
    const key = new Uint8Array(32).fill(73);
    const shards = splitSecret(key, 3, 2);
    const coefficients = random.mock.calls[0][0] as Uint8Array;
    expect([...coefficients]).toEqual(Array(32).fill(0));
    expect(encode.mock.calls.every(([bytes]) => bytes.every((b) => b === 0))).toBe(true);
    expect([...key]).toEqual(Array(32).fill(73));
    expect(combineShards([shards[0], shards[1]])).toEqual(key);
  });
  it("wipes decoded recovery shares even when duplicate shares are rejected", () => {
    const decode = vi.spyOn(b64u, "decode");
    const shard = `1.${b64u.encode(new Uint8Array(32).fill(81))}`;
    expect(() => combineShards([shard, shard])).toThrow("Duplicate shard");
    expect(decode.mock.results.every((result) => result.type === "return" && (result.value as Uint8Array).every((b) => b === 0))).toBe(true);
  });
});