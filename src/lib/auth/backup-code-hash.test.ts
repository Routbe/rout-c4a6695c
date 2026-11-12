import { describe, expect, it } from "vitest";
import { hashBackupCode, hashedBackupCodeStore, isHashedCode } from "./backup-code-hash";

describe("recovery codes are stored hashed", () => {
  it("never stores a plaintext code", async () => {
    const store = hashedBackupCodeStore("pepper", async () => "[]");
    const stored = await store.encrypt(JSON.stringify(["abcde-12345", "fghij-67890"]));
    expect(stored).not.toContain("abcde-12345");
    expect((JSON.parse(stored) as string[]).every(isHashedCode)).toBe(true);
  });

  it("a submitted code hashes to the stored value; a wrong pepper does not", async () => {
    const store = hashedBackupCodeStore("pepper", async () => "[]");
    const stored = JSON.parse(await store.encrypt(JSON.stringify(["abcde-12345"]))) as string[];
    expect(await hashBackupCode("abcde-12345", "pepper")).toBe(stored[0]);
    expect(await hashBackupCode("abcde-12345", "other")).not.toBe(stored[0]);
  });

  it("legacy encrypted lists are converted to hashes on read", async () => {
    const store = hashedBackupCodeStore("pepper", async () => JSON.stringify(["old11-22222"]));
    const out = JSON.parse(await store.decrypt("legacy-ciphertext")) as string[];
    expect(out).toEqual([await hashBackupCode("old11-22222", "pepper")]);
  });
});
