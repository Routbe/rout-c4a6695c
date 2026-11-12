/**
 * Client-side pairwise partner identifiers.
 *
 * From a device-held root secret (passkey PRF output) the device derives, per
 * partner sector, an Ed25519 key. The partner-facing `sub` is the hash of that
 * public key, so the server can verify a signed claim for a `sub` without ever
 * storing which account it belongs to. Different sectors use independent HKDF
 * outputs, so two partners can never link their subjects.
 */
import { ed25519 } from "@noble/curves/ed25519.js";

const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export const SUBJECT_CLAIM_DOMAIN = "rout.pairwise.claim.v1";

/** Sector = partner's registered redirect host (OIDC pairwise sector identifier). */
export function normalizeSector(sector: string): string {
  const s = sector.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(s)) throw new Error("invalid_sector");
  return s;
}

async function sectorSeed(root: Uint8Array, sector: string): Promise<Uint8Array> {
  if (root.length < 32) throw new Error("weak_root");
  const key = await crypto.subtle.importKey("raw", root as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("rout.pairwise.v1") as BufferSource, info: enc.encode(`sector:${normalizeSector(sector)}`) as BufferSource },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function subjectOfPublicKey(publicKey: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([...enc.encode("rout.pairwise.sub.v1"), ...publicKey])));
  return b64u(d);
}

function claimMessage(sector: string, sub: string, nonce: string): Uint8Array {
  return enc.encode(`${SUBJECT_CLAIM_DOMAIN}\n${normalizeSector(sector)}\n${sub}\n${nonce}`);
}

export type SubjectClaim = { sub: string; publicKey: string; signature: string };

/** Derives the sector key, signs the server nonce, wipes the private key. */
export async function claimSubject(root: Uint8Array, sector: string, nonce: string): Promise<SubjectClaim> {
  const sk = await sectorSeed(root, sector);
  try {
    const pk = ed25519.getPublicKey(sk);
    const sub = await subjectOfPublicKey(pk);
    const sig = ed25519.sign(claimMessage(sector, sub, nonce), sk);
    return { sub, publicKey: b64u(pk), signature: b64u(sig) };
  } finally {
    sk.fill(0);
  }
}

/** Server side: the sub must match the key and the signature must cover sector + nonce. */
export async function verifySubjectClaim(claim: SubjectClaim, sector: string, nonce: string): Promise<boolean> {
  try {
    const pk = fromB64u(claim.publicKey);
    if (pk.length !== 32) return false;
    if ((await subjectOfPublicKey(pk)) !== claim.sub) return false;
    return ed25519.verify(fromB64u(claim.signature), claimMessage(sector, claim.sub, nonce), pk);
  } catch {
    return false;
  }
}
