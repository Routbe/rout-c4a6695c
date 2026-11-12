/**
 * NXP NTAG 424 DNA "SUN" (Secure Unique NFC) verification, per NXP AN12196.
 *
 * A tap produces `picc_data` (AES-128-CBC encrypted PICCData: tag byte, 7-byte
 * UID, 3-byte SDMReadCtr) and `cmac` (8 bytes: the odd bytes of an AES-CMAC
 * under a per-tap session key). The session key is
 *   KSesSDMFileReadMAC = CMAC(SDMFileReadKey, 3CC3 0001 0080 || UID || SDMReadCtr).
 *
 * What a valid result proves:
 *   - authenticity: only a chip holding SDMFileReadKey can produce the CMAC
 *     (cloning requires extracting the key from NXP's secure element);
 *   - liveness: the counter is strictly greater than the last accepted one,
 *     so a recorded URL replayed later is refused.
 * The caller persists the new counter atomically (e.g. `update ... set ctr = $new
 * where card = $id and ctr < $new`) — this module is pure and keeps no state.
 *
 * Card keys are `sdm_` vault material (server vault holder, see pqc-envelope).
 * Crypto failures are reported as one SdmError; `reason` is for the server's
 * audit log only and must not be shown to the tapping device.
 */
import { cbc, cmac } from "@noble/ciphers/aes.js";

export type SdmKeys = {
  /** SDMMetaReadKey: decrypts PICCData. 16 bytes. */
  metaReadKey: Uint8Array;
  /** SDMFileReadKey: derives the per-tap MAC session key. 16 bytes. */
  fileReadKey: Uint8Array;
};

export type SdmTap = {
  /** `picc_data` from the tap URL: 32 hex characters. */
  piccData: string;
  /** `cmac` from the tap URL: 16 hex characters. */
  cmac: string;
  /** Bytes from SDMMACInputOffset up to the MAC; empty in the default layout. */
  macInput?: Uint8Array;
};

export type SdmVerified = { uid: string; readCounter: number };

export type SdmFailure = "malformed" | "auth_failed" | "uid_mismatch" | "replayed" | "counter_exhausted";
export class SdmError extends Error {
  constructor(readonly reason: SdmFailure) {
    super("sdm_invalid");
    this.name = "SdmError";
  }
}

const PICC_TAG_UID = 0x80;
const PICC_TAG_CTR = 0x40;
const UID_LEN = 7;
const COUNTER_MAX = 0xffffff;
const SV2_PREFIX = [0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80] as const;

function hexToBytes(hex: string, bytes: number): Uint8Array {
  if (typeof hex !== "string" || hex.length !== bytes * 2 || !/^[0-9A-Fa-f]+$/.test(hex)) throw new SdmError("malformed");
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s.toUpperCase();
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return d === 0;
}

function checkKey(key: Uint8Array) {
  if (!(key instanceof Uint8Array) || key.length !== 16) throw new TypeError("sdm_key_must_be_16_bytes");
}

/**
 * Verifies one tap. `lastCounter` is the highest counter already accepted for
 * this card (null before the first tap); `expectedUid` pins the card's UID.
 */
export function verifySdmTap(input: {
  tap: SdmTap;
  keys: SdmKeys;
  lastCounter: number | null;
  expectedUid?: string;
}): SdmVerified {
  const { tap, keys, lastCounter } = input;
  checkKey(keys.metaReadKey);
  checkKey(keys.fileReadKey);
  if (lastCounter !== null && (!Number.isInteger(lastCounter) || lastCounter < 0 || lastCounter > COUNTER_MAX)) {
    throw new TypeError("sdm_last_counter_invalid");
  }

  const encrypted = hexToBytes(tap.piccData, 16);
  const received = hexToBytes(tap.cmac, 8);
  let picc: Uint8Array | undefined;
  let sv2: Uint8Array | undefined;
  let sessionKey: Uint8Array | undefined;
  let full: Uint8Array | undefined;
  try {
    picc = cbc(keys.metaReadKey, new Uint8Array(16), { disablePadding: true }).decrypt(encrypted);
    const tag = picc[0] ?? 0;
    // Both UID and counter must be mirrored, and the UID must be the 7-byte NTAG UID.
    if ((tag & PICC_TAG_UID) === 0 || (tag & PICC_TAG_CTR) === 0 || (tag & 0x0f) !== UID_LEN) {
      throw new SdmError("auth_failed");
    }
    const uid = picc.slice(1, 1 + UID_LEN);
    const ctrBytes = picc.slice(1 + UID_LEN, 1 + UID_LEN + 3); // LSB first, as the card sends it
    const counter = (ctrBytes[0] ?? 0) | ((ctrBytes[1] ?? 0) << 8) | ((ctrBytes[2] ?? 0) << 16);

    sv2 = new Uint8Array(16);
    sv2.set(SV2_PREFIX, 0);
    sv2.set(uid, SV2_PREFIX.length);
    sv2.set(ctrBytes, SV2_PREFIX.length + UID_LEN);
    sessionKey = cmac(sv2, keys.fileReadKey);
    full = cmac(tap.macInput ?? new Uint8Array(0), sessionKey);
    const truncated = new Uint8Array(8);
    for (let i = 0; i < 8; i++) truncated[i] = full[2 * i + 1] ?? 0;
    if (!constantTimeEqual(truncated, received)) throw new SdmError("auth_failed");

    // Only after authentication: identity and freshness.
    const uidHex = toHex(uid);
    if (input.expectedUid !== undefined && !constantTimeEqual(new TextEncoder().encode(uidHex), new TextEncoder().encode(input.expectedUid.toUpperCase()))) {
      throw new SdmError("uid_mismatch");
    }
    if (counter >= COUNTER_MAX) throw new SdmError("counter_exhausted");
    if (lastCounter !== null && counter <= lastCounter) throw new SdmError("replayed");
    return { uid: uidHex, readCounter: counter };
  } catch (error) {
    if (error instanceof SdmError) throw error;
    throw new SdmError("malformed");
  } finally {
    picc?.fill(0);
    sv2?.fill(0);
    sessionKey?.fill(0);
    full?.fill(0);
  }
}
