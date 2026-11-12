// Master Recovery Key: 24-word BIP39 mnemonic + 2-of-3 Shamir shards over GF(256).
import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { b64u } from "./crypto";
import { wipe } from "@/lib/crypto/wipe";

export function newMasterKey(): { key: Uint8Array; mnemonic: string } {
  const key = crypto.getRandomValues(new Uint8Array(32)); // 256 bits → 24 words
  try {
    return { key, mnemonic: entropyToMnemonic(key, wordlist) };
  } catch (error) {
    wipe(key);
    throw error;
  }
}

export function masterKeyFromMnemonic(mnemonic: string): Uint8Array {
  const m = mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
  try {
    return mnemonicToEntropy(m, wordlist); // validates once, without a discarded extra entropy buffer
  } catch {
    throw new Error("Invalid recovery phrase");
  }
}

// GF(256) arithmetic, AES polynomial 0x11b.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x ^= (x << 1) ^ (x & 0x80 ? 0x11b : 0);
    x &= 0xff;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const div = (a: number, b: number) => (a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0);

/** Split into `n` shards, any `k` reconstruct. Shard = "x.base64url". */
export function splitSecret(secret: Uint8Array, n = 3, k = 2): string[] {
  if (k < 2 || n < k || n > 255) throw new Error("Invalid threshold");
  const coeffs = crypto.getRandomValues(new Uint8Array(secret.length * (k - 1)));
  try {
    return Array.from({ length: n }, (_, idx) => {
      const x = idx + 1;
      const y = secret.map((s, i) => {
        let acc = 0;
        for (let j = k - 2; j >= 0; j--) acc = mul(acc, x) ^ coeffs[i * (k - 1) + j];
        return mul(acc, x) ^ s;
      });
      try {
        return `${x}.${b64u.encode(y)}`;
      } finally {
        wipe(y);
      }
    });
  } finally {
    wipe(coeffs);
  }
}

export function combineShards(shards: string[]): Uint8Array {
  const pts: { x: number; y: Uint8Array }[] = [];
  let out: Uint8Array | null = null;
  try {
    for (const shard of shards) {
      const [x, y] = shard.split(".");
      pts.push({ x: Number(x), y: b64u.decode(y) });
    }
    if (new Set(pts.map((p) => p.x)).size !== pts.length) throw new Error("Duplicate shard");
    const first = pts[0];
    if (!first || pts.some((p) => !Number.isInteger(p.x) || p.x < 1 || p.x > 255 || p.y.length !== first.y.length)) throw new Error("Invalid shard");
    out = new Uint8Array(first.y.length);
    for (let i = 0; i < out.length; i++) {
      let acc = 0;
      for (const a of pts) {
        let num = 1, den = 1;
        for (const b of pts) if (a !== b) { num = mul(num, b.x); den = mul(den, a.x ^ b.x); }
        acc ^= mul(a.y[i], div(num, den));
      }
      out[i] = acc;
    }
    return out; // the caller owns the reconstructed key and its cleanup
  } catch (error) {
    wipe(out);
    throw error;
  } finally {
    for (const point of pts) wipe(point.y);
  }
}
