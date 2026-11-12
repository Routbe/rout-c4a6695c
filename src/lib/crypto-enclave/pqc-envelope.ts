/**
 * RVE1 vault envelope: hybrid post-quantum public-key encryption.
 *
 *   KEM   ML-KEM-1024 (FIPS 203) + X25519, combined with noble's KitchenSink
 *         construction: HKDF over both shared secrets, both ciphertexts and
 *         both public keys, so the key stays secret while EITHER half holds.
 *   AEAD  XChaCha20-Poly1305 with a fresh 32-byte key per envelope and a
 *         random 24-byte nonce.
 *
 * Layout (all fixed except the AEAD body):
 *   0   4    magic "RVE1" (checked by db/0221)
 *   4   1    suite (1 = this construction)
 *   5   1    token kind (1 vtk, 2 vcc, 3 mpc, 4 sdm)
 *   6   1    key holder (1 server vault, 2 member device, 3 shard factor)
 *   7   16   recipient key id = SHA-256("rout.rve1.kid" || publicKey)[0..16)
 *   23  1600 hybrid KEM ciphertext (ML-KEM-1024 1568 || X25519 32)
 *   1623 24  nonce
 *   1647 n+16 XChaCha20-Poly1305(plaintext), tag included
 * AAD = bytes 0..1647 || u16 length || UTF-8 context. The context binds the
 * envelope to its owner and purpose, so a blob moved to another member or
 * another field no longer opens.
 *
 * Who may hold the decryption key is fixed per kind (owner decision):
 * vtk and sdm the server vault, vcc only the member's device, mpc only the
 * shard's own factor. Sealing to, or opening as, any other holder is refused.
 *
 * Every opening failure throws the same EnvelopeError: no oracle about which
 * check failed. Shared secrets and derived keys are wiped in `finally`; the
 * caller owns (and must wipe) its secret key and the returned plaintext.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { shake256 } from "@noble/hashes/sha3.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { _ecdhKem, createKitchenSink } from "@noble/post-quantum/hybrid.js";
import { ml_kem1024 } from "@noble/post-quantum/ml-kem.js";
import type { OpaqueTokenKind } from "@/lib/vault/token-boundary";

export const RVE1_SUITE_LABEL = "ROUT-RVE1-KitchenSink-KEM(ML-KEM-1024,X25519)-XOF(SHAKE256)-KDF(HKDF-SHA-512)";

const kem = createKitchenSink(RVE1_SUITE_LABEL, ml_kem1024, _ecdhKem(x25519), shake256, sha512);

export type KeyHolder = "server_vault" | "member_device" | "shard_factor";

/** Owner-confirmed policy: who may ever decrypt each kind. */
export const KIND_KEY_HOLDER: Readonly<Record<OpaqueTokenKind, KeyHolder>> = Object.freeze({
  vtk: "server_vault",
  vcc: "member_device",
  mpc: "shard_factor",
  sdm: "server_vault",
});

const MAGIC = Uint8Array.of(0x52, 0x56, 0x45, 0x31); // "RVE1"
const SUITE = 1;
const KIND_CODE: Readonly<Record<OpaqueTokenKind, number>> = Object.freeze({ vtk: 1, vcc: 2, mpc: 3, sdm: 4 });
const HOLDER_CODE: Readonly<Record<KeyHolder, number>> = Object.freeze({ server_vault: 1, member_device: 2, shard_factor: 3 });

const KID_LEN = 16;
const KEM_CT_LEN = 1600;
const NONCE_LEN = 24;
const TAG_LEN = 16;
const OFF_KID = 7;
const OFF_KEM = OFF_KID + KID_LEN; // 23
const OFF_NONCE = OFF_KEM + KEM_CT_LEN; // 1623
const OFF_BODY = OFF_NONCE + NONCE_LEN; // 1647
/** Same bounds as the database check in db/0221. */
export const ENVELOPE_MIN_BYTES = OFF_BODY + TAG_LEN;
export const ENVELOPE_MAX_BYTES = 65_536;
export const ENVELOPE_MAX_PLAINTEXT = ENVELOPE_MAX_BYTES - ENVELOPE_MIN_BYTES;
const CONTEXT_MAX_BYTES = 1024;

export const PUBLIC_KEY_BYTES = 1600; // ML-KEM-1024 1568 || X25519 32
export const SECRET_KEY_BYTES = 32; // seed, expanded by SHAKE256 into both secret keys

export class EnvelopeError extends Error {
  constructor() {
    super("envelope_invalid");
    this.name = "EnvelopeError";
  }
}
export class EnvelopePolicyError extends Error {
  constructor(message: "holder_not_allowed_for_kind" | "plaintext_too_large" | "context_invalid" | "public_key_invalid") {
    super(message);
    this.name = "EnvelopePolicyError";
  }
}

export type RecipientKeys = { holder: KeyHolder; publicKey: Uint8Array; secretKey: Uint8Array; kid: Uint8Array };

function wipe(...arrays: (Uint8Array | undefined)[]) {
  for (const a of arrays) a?.fill(0);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return d === 0;
}

const KID_LABEL = new TextEncoder().encode("rout.rve1.kid");
export function keyId(publicKey: Uint8Array): Uint8Array {
  const input = new Uint8Array(KID_LABEL.length + publicKey.length);
  input.set(KID_LABEL);
  input.set(publicKey, KID_LABEL.length);
  return sha256(input).slice(0, KID_LEN);
}

function contextBytes(context: string): Uint8Array {
  const bytes = new TextEncoder().encode(context);
  if (context.length === 0 || bytes.length > CONTEXT_MAX_BYTES) throw new EnvelopePolicyError("context_invalid");
  return bytes;
}

function aad(header: Uint8Array, context: Uint8Array): Uint8Array {
  const out = new Uint8Array(header.length + 2 + context.length);
  out.set(header);
  out[header.length] = context.length >>> 8;
  out[header.length + 1] = context.length & 0xff;
  out.set(context, header.length + 2);
  return out;
}

/** New recipient key pair for a holder. The 32-byte secret key is the whole secret. */
export function generateRecipientKeys(holder: KeyHolder, seed?: Uint8Array): RecipientKeys {
  const { publicKey, secretKey } = kem.keygen(seed);
  return { holder, publicKey, secretKey, kid: keyId(publicKey) };
}

/** Public key for a secret key (used to check the key id when opening). */
export function publicKeyOf(secretKey: Uint8Array): Uint8Array {
  return kem.getPublicKey(secretKey);
}

export function sealEnvelope(input: {
  kind: OpaqueTokenKind;
  holder: KeyHolder;
  recipientPublicKey: Uint8Array;
  plaintext: Uint8Array;
  context: string;
}): Uint8Array {
  const { kind, holder, recipientPublicKey, plaintext } = input;
  if (KIND_KEY_HOLDER[kind] !== holder) throw new EnvelopePolicyError("holder_not_allowed_for_kind");
  if (plaintext.length > ENVELOPE_MAX_PLAINTEXT) throw new EnvelopePolicyError("plaintext_too_large");
  if (recipientPublicKey.length !== PUBLIC_KEY_BYTES) throw new EnvelopePolicyError("public_key_invalid");
  const context = contextBytes(input.context);

  let sharedSecret: Uint8Array | undefined;
  try {
    let encapsulated: { cipherText: Uint8Array; sharedSecret: Uint8Array };
    try {
      encapsulated = kem.encapsulate(recipientPublicKey);
    } catch {
      // Malformed ML-KEM key or low-order X25519 point.
      throw new EnvelopePolicyError("public_key_invalid");
    }
    sharedSecret = encapsulated.sharedSecret;
    const out = new Uint8Array(OFF_BODY + plaintext.length + TAG_LEN);
    out.set(MAGIC, 0);
    out[4] = SUITE;
    out[5] = KIND_CODE[kind];
    out[6] = HOLDER_CODE[holder];
    out.set(keyId(recipientPublicKey), OFF_KID);
    out.set(encapsulated.cipherText, OFF_KEM);
    const nonce = randomBytes(NONCE_LEN);
    out.set(nonce, OFF_NONCE);
    const body = xchacha20poly1305(sharedSecret, nonce, aad(out.subarray(0, OFF_BODY), context)).encrypt(plaintext);
    out.set(body, OFF_BODY);
    return out;
  } finally {
    wipe(sharedSecret);
  }
}

/** Recipient key id of an envelope (a copy), to pick the right key before opening. */
export function envelopeKeyId(envelope: Uint8Array): Uint8Array {
  if (envelope.length < ENVELOPE_MIN_BYTES || !constantTimeEqual(envelope.subarray(0, 4), MAGIC)) throw new EnvelopeError();
  return envelope.slice(OFF_KID, OFF_KEM);
}

/** Opens an envelope as `holder`. Throws EnvelopeError on any mismatch or tamper. */
export function openEnvelope(input: {
  envelope: Uint8Array;
  expectedKind: OpaqueTokenKind;
  holder: KeyHolder;
  secretKey: Uint8Array;
  context: string;
}): Uint8Array {
  const { envelope, expectedKind, holder, secretKey } = input;
  // Policy errors are programming errors on our side, not attacker input: keep them distinct.
  if (KIND_KEY_HOLDER[expectedKind] !== holder) throw new EnvelopePolicyError("holder_not_allowed_for_kind");
  const context = contextBytes(input.context);

  let sharedSecret: Uint8Array | undefined;
  let publicKey: Uint8Array | undefined;
  try {
    if (envelope.length < ENVELOPE_MIN_BYTES || envelope.length > ENVELOPE_MAX_BYTES) throw new EnvelopeError();
    if (!constantTimeEqual(envelope.subarray(0, 4), MAGIC)) throw new EnvelopeError();
    if (envelope[4] !== SUITE || envelope[5] !== KIND_CODE[expectedKind] || envelope[6] !== HOLDER_CODE[holder]) {
      throw new EnvelopeError();
    }
    if (secretKey.length !== SECRET_KEY_BYTES) throw new EnvelopeError();
    publicKey = publicKeyOf(secretKey);
    if (!constantTimeEqual(envelope.subarray(OFF_KID, OFF_KEM), keyId(publicKey))) throw new EnvelopeError();
    // ML-KEM decapsulation never fails: a tampered ciphertext yields an unrelated
    // secret (implicit rejection) and the AEAD tag check below rejects it.
    sharedSecret = kem.decapsulate(envelope.subarray(OFF_KEM, OFF_NONCE), secretKey);
    const nonce = envelope.subarray(OFF_NONCE, OFF_BODY);
    const view = xchacha20poly1305(sharedSecret, nonce, aad(envelope.subarray(0, OFF_BODY), context)).decrypt(
      envelope.subarray(OFF_BODY),
    );
    // Hand back an exact, independent copy; wipe the library's buffer view.
    const plaintext = view.slice();
    wipe(view);
    return plaintext;
  } catch (error) {
    if (error instanceof EnvelopePolicyError) throw error;
    throw new EnvelopeError();
  } finally {
    wipe(sharedSecret, publicKey);
  }
}
