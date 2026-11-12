/**
 * NFC card recovery gate (db/0224): the "nfc_card" factor of 2-of-3 recovery.
 *
 * Works without a session or passkey: the card id comes from the card's own
 * tap URL, and only a live NTAG 424 DNA SUN tap opens the gate.
 *
 *   1. vault_enclave.retrieve_sdm_for_recovery — lockout check (3 failures in
 *      10 minutes, per card and per account) and a PENDING attempt that counts as
 *      a failure until step 3 closes it; returns the sealed sdm_ envelope.
 *   2. The envelope is opened with the server vault key (ROUT_VAULT_KEK), the
 *      AES-CMAC is checked by sdm-verifier.ts against the card's own keys.
 *   3. vault_enclave.confirm_sdm_recovery — binds the verdict to the same tap
 *      bytes, within 60 s, with a strictly higher read counter (replay-proof).
 *
 * Only then is the card factor secret released to the caller. It is the input
 * for factorKeys("nfc_card", …) in recovery-mpc.ts: one of three shards, never
 * enough alone. Every failure is the same VaultDeniedError; reasons stay in the
 * enclave's audit chain.
 */
import { z } from "zod";
import { verifySdmTap } from "@/lib/crypto-enclave/sdm-verifier";
import type { VaultKek } from "./server-kek";
import { openWithServerKey, sealServerToken } from "./server-vault.server";
import { VaultDeniedError, vaultPort, type IVaultPort, type SdmTapBytes } from "./vault-port.server";

/** Context purpose of every card-key envelope (vault-context.ts). */
export const SDM_CARD_PURPOSE = "recovery_card";
const MAGIC = [0x53, 0x44, 0x4b, 0x31] as const; // "SDK1"
const UID_BYTES = 7;
const KEY_BYTES = 16;
const FACTOR_BYTES = 32;
const PLAIN_BYTES = MAGIC.length + UID_BYTES + 2 * KEY_BYTES + FACTOR_BYTES;

/** What the card was personalised with; all of it lives only inside the sdm_ envelope. */
export type SdmCardSecrets = {
  /** 7-byte NTAG UID. */
  uid: Uint8Array;
  metaReadKey: Uint8Array;
  fileReadKey: Uint8Array;
  /** 32 random bytes; the nfc_card recovery factor secret. */
  cardFactorSecret: Uint8Array;
};

export const RecoveryTapSchema = z
  .object({
    cardId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
    piccData: z.string().regex(/^[0-9A-Fa-f]{32}$/),
    cmac: z.string().regex(/^[0-9A-Fa-f]{16}$/),
  })
  .strict();
export type RecoveryTap = z.infer<typeof RecoveryTapSchema>;

export type CardRecoveryGrant = { ownerUserId: string; cardFactorSecret: Uint8Array };

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => Number.parseInt(h, 16));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

export function encodeCardSecrets(s: SdmCardSecrets): Uint8Array {
  if (s.uid.length !== UID_BYTES || s.metaReadKey.length !== KEY_BYTES || s.fileReadKey.length !== KEY_BYTES || s.cardFactorSecret.length !== FACTOR_BYTES) {
    throw new TypeError("sdm_card_secrets_invalid");
  }
  const out = new Uint8Array(PLAIN_BYTES);
  out.set(MAGIC, 0);
  out.set(s.uid, 4);
  out.set(s.metaReadKey, 4 + UID_BYTES);
  out.set(s.fileReadKey, 4 + UID_BYTES + KEY_BYTES);
  out.set(s.cardFactorSecret, 4 + UID_BYTES + 2 * KEY_BYTES);
  return out;
}

/** Views into `plain` (no copies): wiping `plain` wipes them all. */
function decodeCardSecrets(plain: Uint8Array): SdmCardSecrets {
  if (plain.length !== PLAIN_BYTES || MAGIC.some((m, i) => plain[i] !== m)) throw new VaultDeniedError();
  return {
    uid: plain.subarray(4, 4 + UID_BYTES),
    metaReadKey: plain.subarray(4 + UID_BYTES, 4 + UID_BYTES + KEY_BYTES),
    fileReadKey: plain.subarray(4 + UID_BYTES + KEY_BYTES, 4 + UID_BYTES + 2 * KEY_BYTES),
    cardFactorSecret: plain.subarray(4 + UID_BYTES + 2 * KEY_BYTES),
  };
}

/** Seals a personalised card's keys for the server vault and registers the card; returns its card id. */
export async function enrollSdmCard(
  userId: string,
  secrets: SdmCardSecrets,
  deps: { port?: IVaultPort; kek?: VaultKek } = {},
): Promise<string> {
  const port = deps.port ?? vaultPort();
  const plain = encodeCardSecrets(secrets);
  try {
    const ref = await sealServerToken(userId, "sdm", SDM_CARD_PURPOSE, plain, { port, ...(deps.kek ? { kek: deps.kek } : {}) });
    return await port.registerSdmCard({ userId }, ref);
  } finally {
    plain.fill(0);
  }
}

/**
 * Verifies one recovery tap and, only when it is authentic and fresh, returns
 * the card factor secret (a copy the caller must wipe) and the card's owner.
 */
export async function verifyRecoveryTap(
  input: unknown,
  deps: { port?: IVaultPort; kek?: VaultKek } = {},
): Promise<CardRecoveryGrant> {
  const parsed = RecoveryTapSchema.safeParse(input);
  if (!parsed.success) throw new VaultDeniedError();
  const port = deps.port ?? vaultPort();
  const tap: SdmTapBytes = { piccData: hexBytes(parsed.data.piccData), cmac: hexBytes(parsed.data.cmac) };

  const challenge = await port.beginSdmRecovery(parsed.data.cardId, tap);
  let plain: Uint8Array | undefined;
  let verified: { readCounter: number } | null = null;
  try {
    plain = await openWithServerKey(challenge.ownerUserId, "sdm", SDM_CARD_PURPOSE, challenge.envelope, {
      port,
      ...(deps.kek ? { kek: deps.kek } : {}),
    });
    const card = decodeCardSecrets(plain);
    verified = verifySdmTap({
      tap: { piccData: parsed.data.piccData, cmac: parsed.data.cmac },
      keys: { metaReadKey: card.metaReadKey, fileReadKey: card.fileReadKey },
      lastCounter: challenge.lastCounter,
      expectedUid: toHex(card.uid),
    });
    const ok = await port.confirmSdmRecovery(challenge.attemptId, tap, true, verified.readCounter);
    if (!ok) throw new VaultDeniedError();
    return { ownerUserId: challenge.ownerUserId, cardFactorSecret: card.cardFactorSecret.slice() };
  } catch {
    // Close the attempt as failed (it already counts); never say why (SdmError,
    // a wrong KEK or a broken envelope all look the same to the tapping device).
    if (verified === null) await port.confirmSdmRecovery(challenge.attemptId, tap, false, null).catch(() => false);
    throw new VaultDeniedError();
  } finally {
    plain?.fill(0);
  }
}
