/**
 * Message contract between the UI thread and the cryptographic enclave worker.
 * Types only: importing this file never pulls crypto code into the main bundle.
 *
 * Secrets that must come from the user (a typed Master Key, a handoff code, a
 * passkey PRF output) cross into the worker once; keys never come back out.
 * Typed arrays are sent as transferables, so the sender's copy is detached.
 */
import type { SealedBlob } from "@/lib/e2ee/crypto";
import type { PrivateEnvelope } from "@/lib/ledger/crypto";
import type { Capability, CapabilityGrant } from "@/lib/protocol/capabilities";
import type { EventDraft, SignedEvent } from "@/lib/protocol/events";
import type { RecoveryVault, ShardCheck } from "@/lib/recovery/vault";
import type { SubjectClaim } from "@/lib/recovery/pairwise";

/** Public metadata of a decrypted handoff; the full config stays inside the worker. */
export type VaultSummary = { name: string; slug?: string; description?: string };
export type SealedForUser = { encrypted: SealedBlob; keyId: string };
export type LedgerDraft = { keyId: string; publicKey: JsonWebKey; recoveryCode: string; envelopes: PrivateEnvelope[] };

export interface EnclaveOps {
  /** Import the ephemeral secret (then wipe it), derive the claim proof and keep the vault key. */
  "vault.prepare": { req: { secret: string }; res: { handle: string; claimProof: string } };
  /** Decrypt + validate; retained configuration is immediately re-sealed inside the worker. */
  "vault.decrypt": { req: { handle: string; vaultId: string; blob: string; expiresAt: string }; res: VaultSummary };
  /** Re-encrypt the held configuration with the member's device key, then wipe it. */
  "vault.reseal": { req: { handle: string; userId: string }; res: SealedForUser };
  "vault.discard": { req: { handle: string }; res: null };

  "deviceKey.status": { req: { userId: string }; res: { keyId: string } | null };
  /** Entropy is wiped before returning; only a non-extractable pending key remains. */
  "masterKey.generate": { req: Record<string, never>; res: { handle: string; mnemonic: string } };
  "masterKey.commitPending": { req: { handle: string; userId: string }; res: { keyId: string } };
  "masterKey.discardPending": { req: { handle: string }; res: null };
  "masterKey.unlock": { req: { userId: string; mnemonic: string }; res: { keyId: string } };

  /** Generic E2EE: UI hands plaintext in (transferred), gets ciphertext back. */
  "data.seal": { req: { userId: string; aad: string; plaintext: Uint8Array }; res: SealedForUser };
  "data.open": { req: { userId: string; aad: string; blob: string }; res: { plaintext: Uint8Array } };

  /** Encrypted activity ledger (RSA-OAEP + AES-GCM). Private keys live only in the worker. */
  "ledger.generate": { req: { prf?: Uint8Array }; res: LedgerDraft };
  "ledger.activate": { req: { keyId: string }; res: null };
  "ledger.discardPending": { req: { keyId: string }; res: null };
  "ledger.unlock": { req: { keyId: string; envelope: PrivateEnvelope; recoveryCode?: string; prf?: Uint8Array }; res: null };
  "ledger.decrypt": { req: { keyId: string; items: { id: string; payload: string }[] }; res: Record<string, string> };
  "ledger.lock": { req: { keyId?: string }; res: null };

  /** Split a fresh vault key 3-of-5; the Master Key (from its words) is sealed under it and wiped. */
  "recovery.create": { req: { mnemonic: string }; res: { vault: RecoveryVault; shards: string[] } };
  "recovery.check": { req: { vault: RecoveryVault; shard: string }; res: ShardCheck };
  /** Reconstruct and install as this device's key; `practice` verifies without installing. */
  "recovery.restore": { req: { userId: string; vault: RecoveryVault; shards: string[]; practice?: boolean }; res: { keyId: string | null } };
  "recovery.sealShard": { req: { prf: Uint8Array; shard: string; vaultId: string }; res: { blob: string } };
  "recovery.openShard": { req: { prf: Uint8Array; blob: string; vaultId: string }; res: { shard: string } };
  /** Pairwise partner subject from a passkey PRF root (transferred, wiped). */
  "pairwise.claim": { req: { root: Uint8Array; sector: string; nonce: string }; res: SubjectClaim };

  "hash.sha256Hex": { req: { text: string }; res: string };
  /**
   * Blind Hash Matching: hash the member's identities with the partner's
   * domain separation and return only the indexes that match a partner hash.
   */
  "bhm.match": { req: { clientId: string; hashes: string[]; identities: { kind: string; value: string }[] }; res: number[] };

  /** Protocol identity (did:key, Ed25519). Created on first use, stored sealed under the device key. */
  "protocol.identity": { req: { userId: string }; res: { did: string } };
  /** Seal `plaintext` (transferred) for the stream, then hash-chain and sign the event. */
  "protocol.sealEvent": {
    req: { userId: string; stream: string; seq: number; prev: string | null; kind: string; plaintext: Uint8Array; capId?: string };
    res: SignedEvent;
  };
  /** Sign a control event (`stream.genesis`, `cap.revoke`, `pub.*`) whose body is public by design. */
  "protocol.signEvent": { req: { userId: string; draft: EventDraft }; res: SignedEvent };
  "protocol.openEvent": { req: { userId: string; event: SignedEvent }; res: { plaintext: Uint8Array } };
  "protocol.dpop": { req: { userId: string; method: string; url: string }; res: { proof: string } };
  "protocol.delegate": { req: { userId: string; grant: CapabilityGrant; parent?: Capability | null }; res: Capability };
  "protocol.verifyChain": { req: { events: SignedEvent[] }; res: { ok: true } | { ok: false; error: string; at: number } };
}

export type EnclaveOp = keyof EnclaveOps;
export type EnclaveArgs<K extends EnclaveOp> = EnclaveOps[K]["req"];
export type EnclaveResult<K extends EnclaveOp> = EnclaveOps[K]["res"];

export type EnclaveRequest = { [K in EnclaveOp]: { id: number; op: K; args: EnclaveArgs<K> } }[EnclaveOp];

export type EnclaveErrorCode =
  | "enclave_unavailable"
  | "enclave_crashed"
  | "timeout"
  | "invalid_input"
  | "unknown_handle"
  | "decrypt_failed"
  | "invalid_config"
  | "invalid_mnemonic"
  | "no_device_key"
  | "internal";

export type EnclaveResponse =
  | { id: number; started: true }
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; code: EnclaveErrorCode };
