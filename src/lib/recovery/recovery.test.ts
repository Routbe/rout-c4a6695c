import { describe, expect, it } from "vitest";
import { combine, gfInv, gfMul, split } from "./shamir";
import { decodeShard, encodeShard } from "./shard-codec";
import { checkShard, createVault, openVault } from "./vault";
import { claimSubject, verifySubjectClaim } from "./pairwise";

const combos = (n: number, k: number): number[][] => {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) return void out.push(acc);
    for (let i = start; i < n; i++) rec(i + 1, [...acc, i]);
  };
  rec(0, []);
  return out;
};

describe("GF(256)", () => {
  it("matches the AES field known answer 0x57 * 0x83 = 0xc1", () => expect(gfMul(0x57, 0x83)).toBe(0xc1));
  it("every non-zero element has an inverse", () => {
    for (let a = 1; a < 256; a++) expect(gfMul(a, gfInv(a))).toBe(1);
  });
});

describe("Shamir 3-of-5", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const shares = split(secret, 3, 5);
  it("every combination of 3 out of 5 reconstructs the secret", () => {
    const all = combos(5, 3);
    expect(all).toHaveLength(10);
    for (const c of all) expect(combine(c.map((i) => shares[i]!))).toEqual(secret);
  });
  it("2 shares do not give the secret", () => {
    expect(combine([shares[0]!, shares[1]!])).not.toEqual(secret);
  });
  it("is deterministic with fixed randomness (known answer)", () => {
    const fixed = (n: number) => new Uint8Array(n).fill(7);
    const s = split(Uint8Array.of(42), 3, 5, fixed);
    // f(x) = 42 + 7x + 7x^2 in GF(256)
    expect(s[0]!.y[0]).toBe(42 ^ 7 ^ 7);
    expect(combine(s.slice(2)).at(0)).toBe(42);
  });
});

describe("shard codec", () => {
  it("round-trips and rejects a typo", async () => {
    const text = await encodeShard({ version: 1, threshold: 3, index: 2, vaultId: new Uint8Array(16).fill(1), share: new Uint8Array(32).fill(9) });
    expect((await decodeShard(text)).index).toBe(2);
    const typo = text.slice(0, 10) + (text[10] === "A" ? "B" : "A") + text.slice(11);
    await expect(decodeShard(typo)).rejects.toThrow();
  });
});

describe("recovery vault", () => {
  it("3 shards bring back the Master Key; 2 do not", async () => {
    const master = crypto.getRandomValues(new Uint8Array(32));
    const { vault, shards } = await createVault(master);
    expect(shards).toHaveLength(5);
    expect(await openVault([shards[4]!, shards[0]!, shards[2]!], vault)).toEqual(master);
    await expect(openVault([shards[0]!, shards[1]!], vault)).rejects.toThrow("not_enough_shards");
  });
  it("names a forged shard before reconstructing", async () => {
    const { vault, shards } = await createVault(new Uint8Array(32).fill(3));
    const other = await createVault(new Uint8Array(32).fill(3));
    expect(await checkShard(shards[0]!, vault)).toEqual({ index: 1, ok: true });
    expect((await checkShard(other.shards[0]!, vault)).reason).toBe("wrong_vault");
    const forged = await encodeShard({ version: 1, threshold: 3, index: 1, vaultId: Uint8Array.from(vault.vaultId.match(/.{2}/g)!.map((h) => parseInt(h, 16))), share: new Uint8Array(32) });
    expect((await checkShard(forged, vault)).reason).toBe("forged");
  });
  it("rotation makes old shards worthless", async () => {
    const master = new Uint8Array(32).fill(5);
    const old = await createVault(master);
    const fresh = await createVault(master);
    await expect(openVault(old.shards.slice(0, 3), fresh.vault)).rejects.toThrow("wrong_vault");
  });
});

describe("pairwise partner ids", () => {
  const root = crypto.getRandomValues(new Uint8Array(32));
  it("same partner gives the same id, another partner a different id", async () => {
    const a1 = await claimSubject(root, "app.zwembad.be", "n1");
    const a2 = await claimSubject(root, "app.zwembad.be", "n2");
    const b = await claimSubject(root, "delijn.be", "n1");
    expect(a1.sub).toBe(a2.sub);
    expect(b.sub).not.toBe(a1.sub);
  });
  it("server accepts a correct claim and refuses a wrong signature, sector or nonce", async () => {
    const c = await claimSubject(root, "app.zwembad.be", "nonce-1");
    expect(await verifySubjectClaim(c, "app.zwembad.be", "nonce-1")).toBe(true);
    expect(await verifySubjectClaim(c, "delijn.be", "nonce-1")).toBe(false);
    expect(await verifySubjectClaim(c, "app.zwembad.be", "nonce-2")).toBe(false);
    const other = await claimSubject(crypto.getRandomValues(new Uint8Array(32)), "app.zwembad.be", "nonce-1");
    expect(await verifySubjectClaim({ ...c, signature: other.signature }, "app.zwembad.be", "nonce-1")).toBe(false);
  });
});
