/**
 * argon2id over the vault claim proof, encoded as a PHC string
 * (`$argon2id$v=19$m=…,t=…,p=1$<salt>$<hash>`). Pure JS (@noble/hashes), so it
 * runs on the Worker runtime without WebAssembly. The input is a 256-bit
 * random value, so these parameters are defence in depth, not the only barrier.
 */
import { argon2idAsync } from "@noble/hashes/argon2.js";
import { b64u } from "@/lib/e2ee/crypto";

export const VAULT_ARGON2 = { t: 2, m: 8192, p: 1 } as const;
const PHC_RE = /^\$argon2id\$v=19\$m=(\d{1,6}),t=(\d{1,2}),p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/;

const toB64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "");
};
const fromB64 = (s: string) => Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

function proofBytes(proof: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(proof)) throw new Error("invalid_claim_proof");
  return b64u.decode(proof);
}

export async function hashClaimProof(proof: string, salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  const { t, m, p } = VAULT_ARGON2;
  const out = await argon2idAsync(proofBytes(proof), salt, { t, m, p, dkLen: 32 });
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${toB64(salt)}$${toB64(out)}`;
}

/** Constant-time check. Parameters are bounded so a stored hash cannot be used to burn CPU. */
export async function verifyClaimProof(proof: string, phc: string): Promise<boolean> {
  const m = PHC_RE.exec(phc);
  if (!m || !/^[A-Za-z0-9_-]{43}$/.test(proof)) return false;
  const mem = Number(m[1]);
  const t = Number(m[2]);
  if (mem < 1024 || mem > 65536 || t < 1 || t > 10) return false;
  const expected = fromB64(m[4]);
  const actual = await argon2idAsync(proofBytes(proof), fromB64(m[3]), { t, m: mem, p: 1, dkLen: 32 });
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
