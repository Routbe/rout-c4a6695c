/**
 * `did:key` for Ed25519 (multicodec 0xed01, multibase base58btc `z…`), plus
 * domain-separated sign/verify. A did:key is self-certifying: the public key
 * IS the identifier, so the server needs no identity table to verify a
 * signature — only to decide what that key may touch.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { concat, fromBase58, toBase58, utf8 } from "./encoding";
import { wipe } from "@/lib/crypto/wipe";

const ED25519_PREFIX = new Uint8Array([0xed, 0x01]);
const DID_RE = /^did:key:z[1-9A-HJ-NP-Za-km-z]{40,60}$/;

export function didFromPublicKey(pk: Uint8Array): string {
  if (pk.length !== 32) throw new Error("invalid_public_key");
  return `did:key:z${toBase58(concat(ED25519_PREFIX, pk))}`;
}

export function isDidKey(v: unknown): v is string {
  if (typeof v !== "string" || !DID_RE.test(v)) return false;
  try {
    publicKeyFromDid(v);
    return true;
  } catch {
    return false;
  }
}

export function publicKeyFromDid(did: string): Uint8Array {
  if (!DID_RE.test(did)) throw new Error("invalid_did");
  const raw = fromBase58(did.slice("did:key:z".length));
  if (raw.length !== 34 || raw[0] !== 0xed || raw[1] !== 0x01) throw new Error("unsupported_did_key");
  const pk = raw.slice(2);
  if (!ed25519.utils.isValidPublicKey(pk)) throw new Error("invalid_public_key");
  return pk;
}

/** Every signature names its purpose, so an event signature can never be replayed as a capability or DPoP proof. */
export type SignDomain = "rout.event.v1" | "rout.zcap.v1";

const framed = (domain: SignDomain, digest: Uint8Array) => concat(utf8(`${domain}\n`), digest);

export function signDigest(secretKey: Uint8Array, domain: SignDomain, digest: Uint8Array): Uint8Array {
  return ed25519.sign(framed(domain, digest), secretKey);
}

export function verifyDigest(did: string, domain: SignDomain, digest: Uint8Array, sig: Uint8Array): boolean {
  try {
    if (sig.length !== 64) return false;
    return ed25519.verify(sig, framed(domain, digest), publicKeyFromDid(did));
  } catch {
    return false;
  }
}

export function newIdentityKey(): { secretKey: Uint8Array; did: string } {
  const secretKey = ed25519.utils.randomSecretKey();
  try {
    return { secretKey, did: didFromPublicKey(ed25519.getPublicKey(secretKey)) };
  } catch (error) {
    wipe(secretKey);
    throw error;
  }
}

export const didOfSecretKey = (secretKey: Uint8Array): string => didFromPublicKey(ed25519.getPublicKey(secretKey));
