import { describe, expect, it } from "vitest";
import { missingShards, slotsReady, type SlotKind } from "./vault-rules";

const slot = (kind: SlotKind) => ({ kind, done: true, sealed: kind === "passkey" ? {} : undefined });

describe("recovery vault rules", () => {
  it("allows at most 2 shards stored at ROUT", () => {
    expect(slotsReady(["passkey", "passkey", "paper", "nfc", "contact"].map((k) => slot(k as SlotKind)))).toBe(true);
    expect(slotsReady(["passkey", "passkey", "passkey", "nfc", "contact"].map((k) => slot(k as SlotKind)))).toBe(false);
  });
  it("needs 3 distinct shards to restore", () => {
    expect(missingShards([], 3)).toBe(3);
    expect(missingShards([1, 1, 2], 3)).toBe(1);
    expect(missingShards([1, 2, 5], 3)).toBe(0);
  });
});
