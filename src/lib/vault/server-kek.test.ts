import { describe, expect, it } from "vitest";
import { deriveVaultKek, KekError, WRAPPED_SEED_BYTES } from "./server-kek";

const SECRET = "A".repeat(40) + "b9".repeat(20);
const kid = new Uint8Array(16).fill(7);
const seed = () => new Uint8Array(32).map((_, i) => i + 1);

describe("Master KEK (AES-256-GCM seed wrap)", () => {
  it("wraps a seed into 80 bytes and unwraps it exactly", () => {
    const kek = deriveVaultKek(SECRET);
    const wrapped = kek.wrap(kid, seed());
    expect(wrapped.length).toBe(WRAPPED_SEED_BYTES);
    expect(new TextDecoder().decode(wrapped.subarray(0, 4))).toBe("RVK1");
    expect([...kek.unwrap(kid, wrapped)]).toEqual([...seed()]);
  });

  it("never wraps the same seed to the same bytes", () => {
    const kek = deriveVaultKek(SECRET);
    expect([...kek.wrap(kid, seed())]).not.toEqual([...kek.wrap(kid, seed())]);
  });

  it("refuses another KEK, another key id and any flipped byte", () => {
    const wrapped = deriveVaultKek(SECRET).wrap(kid, seed());
    expect(() => deriveVaultKek("Z".repeat(64)).unwrap(kid, wrapped)).toThrow(KekError);
    expect(() => deriveVaultKek(SECRET).unwrap(new Uint8Array(16).fill(8), wrapped)).toThrow(KekError);
    for (const i of [0, 5, 25, 40, 79]) {
      const bad = wrapped.slice();
      bad[i] = (bad[i] ?? 0) ^ 1;
      expect(() => deriveVaultKek(SECRET).unwrap(kid, bad)).toThrow(KekError);
    }
  });

  it("accepts only long generated secrets", () => {
    for (const s of ["", "short", "a".repeat(63), "a".repeat(63) + "!", "a".repeat(513)]) expect(() => deriveVaultKek(s)).toThrow(KekError);
    expect(() => deriveVaultKek("a".repeat(64))).not.toThrow();
  });

  it("derives a stable key id that differs per secret", () => {
    expect([...deriveVaultKek(SECRET).kekId]).toEqual([...deriveVaultKek(SECRET).kekId]);
    expect([...deriveVaultKek(SECRET).kekId]).not.toEqual([...deriveVaultKek("Q".repeat(64)).kekId]);
  });

  it("is unusable after dispose", () => {
    const kek = deriveVaultKek(SECRET);
    const wrapped = kek.wrap(kid, seed());
    kek.dispose();
    expect(() => kek.unwrap(kid, wrapped)).toThrow(KekError);
    expect(() => kek.wrap(kid, seed())).toThrow(KekError);
  });
});
