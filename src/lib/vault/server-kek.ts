/**
 * Master KEK (ROUT_VAULT_KEK) for the server vault, AES-256-GCM via @noble/ciphers.
 *
 * The KEK never encrypts data. It wraps the 32-byte secret seed of the server
 * vault's RVE1 recipient key (ML-KEM-1024 + X25519); that key opens vtk_ and
 * sdm_ envelopes. Wrapped seeds live in vault_enclave.server_keys (db/0222),
 * the KEK only in the server environment: neither half alone opens anything.
 *
 *   wrap = "RVK1" || kekId(16) || nonce(12) || AES-256-GCM(seed) incl. tag(16)  = 80 bytes
 *   AAD  = "rout.vault.server-seed.v1" || kekId || kid
 *
 * The AES key and the KEK id are derived from the secret with HKDF-SHA-256
 * under separate labels, so the id identifies the KEK without revealing it.
 * Every failure is the same KekError (no oracle). The caller wipes what it owns:
 * `dispose()` the KEK, `fill(0)` an unwrapped seed.
 */
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

/** Generated secrets are alphanumeric: 64+ characters carry over 380 bits. */
const KEK_SECRET_RE = /^[A-Za-z0-9]{64,512}$/;
const MAGIC = Uint8Array.of(0x52, 0x56, 0x4b, 0x31); // "RVK1"
const KEK_ID_LEN = 16;
const KID_LEN = 16;
const NONCE_LEN = 12;
const SEED_LEN = 32;
const TAG_LEN = 16;
export const WRAPPED_SEED_BYTES = MAGIC.length + KEK_ID_LEN + NONCE_LEN + SEED_LEN + TAG_LEN; // 80

const enc = new TextEncoder();
const SALT = enc.encode("rout.vault.kek.v1");
const AAD_LABEL = enc.encode("rout.vault.server-seed.v1");

export class KekError extends Error {
  constructor() {
    super("vault_kek_invalid");
    this.name = "KekError";
  }
}

export type VaultKek = { readonly kekId: Uint8Array; wrap(kid: Uint8Array, seed: Uint8Array): Uint8Array; unwrap(kid: Uint8Array, wrapped: Uint8Array): Uint8Array; dispose(): void };

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return d === 0;
}

function aad(kekId: Uint8Array, kid: Uint8Array): Uint8Array {
  const out = new Uint8Array(AAD_LABEL.length + KEK_ID_LEN + KID_LEN);
  out.set(AAD_LABEL);
  out.set(kekId, AAD_LABEL.length);
  out.set(kid, AAD_LABEL.length + KEK_ID_LEN);
  return out;
}

/** Derives the KEK from the environment secret. Rejects anything that is not a generated secret. */
export function deriveVaultKek(secret: string): VaultKek {
  if (!KEK_SECRET_RE.test(secret)) throw new KekError();
  const ikm = enc.encode(secret);
  const key = hkdf(sha256, ikm, SALT, enc.encode("aes-256-gcm.seed-wrap"), 32);
  const kekId = hkdf(sha256, ikm, SALT, enc.encode("kek-id"), KEK_ID_LEN);
  ikm.fill(0);
  let disposed = false;
  const live = () => {
    if (disposed) throw new KekError();
  };
  return {
    kekId,
    wrap(kid, seed) {
      live();
      if (kid.length !== KID_LEN || seed.length !== SEED_LEN) throw new KekError();
      const nonce = randomBytes(NONCE_LEN);
      const body = gcm(key, nonce, aad(kekId, kid)).encrypt(seed);
      const out = new Uint8Array(WRAPPED_SEED_BYTES);
      out.set(MAGIC, 0);
      out.set(kekId, 4);
      out.set(nonce, 4 + KEK_ID_LEN);
      out.set(body, 4 + KEK_ID_LEN + NONCE_LEN);
      body.fill(0);
      return out;
    },
    unwrap(kid, wrapped) {
      live();
      try {
        if (kid.length !== KID_LEN || wrapped.length !== WRAPPED_SEED_BYTES) throw new KekError();
        if (!equal(wrapped.subarray(0, 4), MAGIC) || !equal(wrapped.subarray(4, 4 + KEK_ID_LEN), kekId)) throw new KekError();
        const nonce = wrapped.subarray(4 + KEK_ID_LEN, 4 + KEK_ID_LEN + NONCE_LEN);
        const view = gcm(key, nonce, aad(kekId, kid)).decrypt(wrapped.subarray(4 + KEK_ID_LEN + NONCE_LEN));
        const seed = view.slice();
        view.fill(0);
        return seed;
      } catch {
        throw new KekError();
      }
    },
    dispose() {
      disposed = true;
      key.fill(0);
    },
  };
}
