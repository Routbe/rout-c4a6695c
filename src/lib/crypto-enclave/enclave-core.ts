/**
 * Cryptographic enclave: every browser-side key operation for E2EE, the AI
 * handoff vault and the encrypted ledger. Imported ONLY by crypto.worker.ts —
 * derived/private keys never leave the worker. Recovery words and WebAuthn
 * output necessarily pass through the browser UI and are not XSS-isolated.
 *
 * Memory discipline: each typed array holding a raw secret or plaintext is
 * zero-filled in a `finally` as soon as its operation ends. Pending master
 * keys are non-extractable; vault configuration is held only as ciphertext.
 */
import { b64u, isSealedBlob, type SealedBlob } from "@/lib/e2ee/crypto";
import { masterKeyFromMnemonic, newMasterKey } from "@/lib/e2ee/recovery";
import { loadDeviceKey, saveDeviceKey, workspaceKeyFromMaster, type WorkspaceKey } from "@/lib/e2ee/device-key";
import { decryptLedgerEvent, generateLedgerKeys, unlockLedgerKey } from "@/lib/ledger/crypto";
import { wipe, wipeMessage } from "@/lib/crypto/wipe";
import { BHM_MAX_HASHES, bhmPreimage, isBhmKind } from "@/lib/oauth/blind-hash";
import { checkShard, createVault, openShardWithPrf, openVault, sealShardWithPrf } from "@/lib/recovery/vault";
import { claimSubject } from "@/lib/recovery/pairwise";
import {
  VAULT_TTL_MINUTES,
  isEphemeralSecret,
  vaultAad,
  vaultClaimProofFrom,
  vaultConfigSchema,
  vaultEncryptionKeyFrom,
  vaultHkdfBase,
  workspaceConfigAad,
} from "@/lib/vault/ephemeral-vault";
import { isStreamId, issueCapability } from "@/lib/protocol/capabilities";
import { didOfSecretKey, newIdentityKey } from "@/lib/protocol/did-key";
import { createDpopProof } from "@/lib/protocol/dpop";
import { signEvent, verifyEvent, verifyChain } from "@/lib/protocol/events";
import { eventAad, identityAad, loadIdentity, saveIdentity } from "@/lib/protocol/identity-store";
import type { EnclaveErrorCode, EnclaveOp, EnclaveOps } from "./protocol";

const enc = new TextEncoder();
const dec = new TextDecoder();
const MINUTE = 60_000;
const PENDING_TTL = 15 * MINUTE;
// Largest input whose base64url ciphertext fits the existing <64 KiB blind column.
const MAX_PLAINTEXT_BYTES = 49120;

export class EnclaveFailure extends Error {
  constructor(readonly code: EnclaveErrorCode) {
    super(code);
  }
}

const fail = (code: EnclaveErrorCode): never => {
  throw new EnclaveFailure(code);
};

const newHandle = () => b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
const str = (v: unknown, max = 4096): string => (typeof v === "string" && v.length <= max ? v : fail("invalid_input"));
const bytes = (v: unknown): Uint8Array =>
  v instanceof Uint8Array && v.buffer instanceof ArrayBuffer ? v : fail("invalid_input");

// ---- Held state (all of it wiped on discard / expiry) ----------------------

type VaultSlot = { key: CryptoKey; sealedConfig: SealedBlob | null; expiresAt: number; timer: ReturnType<typeof setTimeout> };
const vaults = new Map<string, VaultSlot>();
const pendingMasters = new Map<string, { value: WorkspaceKey; expiresAt: number; timer: ReturnType<typeof setTimeout> }>();
const pendingLedger = new Map<string, { key: CryptoKey; expiresAt: number; timer: ReturnType<typeof setTimeout> }>();
const ledgerKeys = new Map<string, CryptoKey>();

function discardVault(handle: string) {
  const slot = vaults.get(handle);
  if (!slot) return;
  clearTimeout(slot.timer);
  slot.sealedConfig = null;
  vaults.delete(handle);
}

function discardMaster(handle: string) {
  const p = pendingMasters.get(handle);
  if (!p) return;
  clearTimeout(p.timer);
  pendingMasters.delete(handle);
}

function discardLedgerDraft(keyId: string) {
  const p = pendingLedger.get(keyId);
  if (!p) return;
  clearTimeout(p.timer);
  pendingLedger.delete(keyId);
}

// ---- AES-256-GCM on bytes (same `v1.iv.ct` format as e2ee/crypto seal/open) --

async function sealBytes(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<SealedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, plaintext as BufferSource);
  return `v1.${b64u.encode(iv)}.${b64u.encode(new Uint8Array(ct))}`;
}

async function openBytes(key: CryptoKey, blob: string, aad: string): Promise<Uint8Array> {
  if (!isSealedBlob(blob)) fail("invalid_input");
  const [, iv, ct] = blob.split(".");
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u.decode(iv) as BufferSource, additionalData: enc.encode(aad) }, key, b64u.decode(ct) as BufferSource),
    );
  } catch {
    return fail("decrypt_failed");
  }
}

async function deviceKeyFor(userId: string) {
  return (await loadDeviceKey(str(userId, 200))) ?? fail("no_device_key");
}

/**
 * Runs `fn` with the member's protocol secret key, creating the identity on
 * first use. The key exists in memory only for the duration of `fn`.
 */
async function withIdentity<T>(userId: string, fn: (sk: Uint8Array, did: string) => Promise<T>): Promise<T> {
  const dk = await deviceKeyFor(userId);
  let stored = await loadIdentity(userId);
  let sk: Uint8Array | null = null;
  try {
    if (!stored) {
      const fresh = newIdentityKey();
      sk = fresh.secretKey;
      stored = { did: fresh.did, keyId: dk.keyId, sealedSecret: await sealBytes(dk.key, sk, identityAad(userId, fresh.did)) };
      await saveIdentity(userId, stored);
    } else {
      if (stored.keyId !== dk.keyId) fail("decrypt_failed");
      sk = await openBytes(dk.key, stored.sealedSecret, identityAad(userId, stored.did));
    }
    if (sk.length !== 32 || didOfSecretKey(sk) !== stored.did) fail("decrypt_failed");
    return await fn(sk, stored.did);
  } finally {
    wipe(sk);
  }
}

async function storeMaster(userId: string, entropy: Uint8Array) {
  try {
    const owner = str(userId, 200);
    const k = await workspaceKeyFromMaster(entropy);
    await saveDeviceKey(owner, k);
    return { keyId: k.keyId };
  } finally {
    wipe(entropy);
  }
}

// ---- Operations -------------------------------------------------------------

type Handlers = { [K in EnclaveOp]: (args: EnclaveOps[K]["req"]) => Promise<EnclaveOps[K]["res"]> };

export const handlers: Handlers = {
  async "vault.prepare"({ secret }) {
    if (!isEphemeralSecret(secret)) fail("invalid_input");
    const base = await vaultHkdfBase(secret); // wipes the decoded secret bytes
    const [claimProof, key] = await Promise.all([vaultClaimProofFrom(base), vaultEncryptionKeyFrom(base)]);
    const handle = newHandle();
    vaults.set(handle, { key, sealedConfig: null, expiresAt: Date.now() + VAULT_TTL_MINUTES * MINUTE, timer: setTimeout(() => discardVault(handle), VAULT_TTL_MINUTES * MINUTE) });
    return { handle, claimProof };
  },

  async "vault.decrypt"({ handle, vaultId, blob, expiresAt }) {
    const slot = vaults.get(str(handle)) ?? fail("unknown_handle");
    const expiry = Date.parse(str(expiresAt, 64));
    if (!Number.isFinite(expiry) || expiry <= Date.now() || slot.expiresAt <= Date.now()) {
      discardVault(handle);
      fail("unknown_handle");
    }
    let pt: Uint8Array | null = null;
    let normalized: Uint8Array | null = null;
    try {
      pt = await openBytes(slot.key, str(blob, 65536), vaultAad(str(vaultId, 64)));
      let raw: unknown;
      try {
        raw = JSON.parse(dec.decode(pt));
      } catch {
        return fail("invalid_config");
      }
      const parsed = vaultConfigSchema.safeParse(raw);
      if (!parsed.success) return fail("invalid_config");
      normalized = enc.encode(JSON.stringify(parsed.data));
      const sealedConfig = await sealBytes(slot.key, normalized, `rout.enclave.pending.v1:${handle}`);
      if (vaults.get(handle) !== slot || Math.min(expiry, slot.expiresAt) <= Date.now()) fail("unknown_handle");
      slot.sealedConfig = sealedConfig;
      slot.expiresAt = Math.min(expiry, slot.expiresAt);
      clearTimeout(slot.timer);
      slot.timer = setTimeout(() => discardVault(handle), Math.max(0, slot.expiresAt - Date.now()));
      const { name, slug, description } = parsed.data;
      return { name, ...(slug ? { slug } : {}), ...(description ? { description } : {}) };
    } catch (e) {
      discardVault(handle);
      throw e;
    } finally {
      wipe(pt, normalized);
    }
  },

  async "vault.reseal"({ handle, userId }) {
    const slot = vaults.get(str(handle)) ?? fail("unknown_handle");
    const sealedConfig = slot.sealedConfig;
    discardVault(handle); // consume before awaiting: a handle can only reseal once
    let plaintext: Uint8Array | null = null;
    try {
      if (slot.expiresAt <= Date.now()) fail("unknown_handle");
      if (!sealedConfig) return fail("invalid_input");
      const dk = await deviceKeyFor(userId);
      plaintext = await openBytes(slot.key, sealedConfig, `rout.enclave.pending.v1:${handle}`);
      const encrypted = await sealBytes(dk.key, plaintext, workspaceConfigAad(userId));
      if (slot.expiresAt <= Date.now()) fail("unknown_handle");
      return { encrypted, keyId: dk.keyId };
    } finally {
      wipe(plaintext);
      discardVault(handle);
    }
  },

  async "vault.discard"({ handle }) {
    discardVault(str(handle));
    return null;
  },

  async "deviceKey.status"({ userId }) {
    const k = await loadDeviceKey(str(userId, 200));
    return k ? { keyId: k.keyId } : null;
  },

  async "masterKey.generate"() {
    const { key, mnemonic } = newMasterKey();
    try {
      const value = await workspaceKeyFromMaster(key);
      const handle = newHandle();
      pendingMasters.set(handle, { value, expiresAt: Date.now() + PENDING_TTL, timer: setTimeout(() => discardMaster(handle), PENDING_TTL) });
      return { handle, mnemonic };
    } finally {
      wipe(key);
    }
  },

  async "masterKey.commitPending"({ handle, userId }) {
    const p = pendingMasters.get(str(handle)) ?? fail("unknown_handle");
    discardMaster(handle);
    if (p.expiresAt <= Date.now()) fail("unknown_handle");
    await saveDeviceKey(str(userId, 200), p.value);
    return { keyId: p.value.keyId };
  },

  async "masterKey.discardPending"({ handle }) {
    discardMaster(str(handle));
    return null;
  },

  async "masterKey.unlock"({ userId, mnemonic }) {
    let entropy: Uint8Array;
    try {
      entropy = masterKeyFromMnemonic(str(mnemonic, 1024));
    } catch {
      return fail("invalid_mnemonic");
    }
    return storeMaster(userId, entropy);
  },

  async "recovery.create"({ mnemonic }) {
    let entropy: Uint8Array;
    try {
      entropy = masterKeyFromMnemonic(str(mnemonic, 1024));
    } catch {
      return fail("invalid_mnemonic");
    }
    try {
      return await createVault(entropy);
    } finally {
      wipe(entropy);
    }
  },

  async "recovery.check"({ vault, shard }) {
    return checkShard(str(shard, 400), vault);
  },

  async "recovery.restore"({ userId, vault, shards, practice }) {
    if (!Array.isArray(shards) || shards.length > 5) fail("invalid_input");
    let entropy: Uint8Array;
    try {
      entropy = await openVault(shards.map((t) => str(t, 400)), vault);
    } catch {
      return fail("decrypt_failed");
    }
    if (practice) {
      wipe(entropy);
      return { keyId: null };
    }
    return storeMaster(userId, entropy);
  },

  async "recovery.sealShard"({ prf, shard, vaultId }) {
    const k = bytes(prf);
    try {
      return { blob: await sealShardWithPrf(k, str(shard, 400), str(vaultId, 32)) };
    } finally {
      wipe(k);
    }
  },

  async "recovery.openShard"({ prf, blob, vaultId }) {
    const k = bytes(prf);
    try {
      return { shard: await openShardWithPrf(k, str(blob, 600), str(vaultId, 32)) };
    } catch {
      return fail("decrypt_failed");
    } finally {
      wipe(k);
    }
  },

  async "pairwise.claim"({ root, sector, nonce }) {
    const r = bytes(root);
    try {
      return await claimSubject(r, str(sector, 253), str(nonce, 200));
    } catch {
      return fail("invalid_input");
    } finally {
      wipe(r);
    }
  },

  async "data.seal"({ userId, aad, plaintext }) {
    const pt = bytes(plaintext);
    try {
      if (pt.byteLength > MAX_PLAINTEXT_BYTES) fail("invalid_input");
      const dk = await deviceKeyFor(userId);
      return { encrypted: await sealBytes(dk.key, pt, str(aad, 512)), keyId: dk.keyId };
    } finally {
      wipe(pt);
    }
  },

  async "data.open"({ userId, aad, blob }) {
    const dk = await deviceKeyFor(userId);
    return { plaintext: await openBytes(dk.key, str(blob, 65536), str(aad, 512)) }; // transferred, not copied
  },

  async "ledger.generate"({ prf }) {
    const prfBytes = prf === undefined ? undefined : bytes(prf);
    try {
      const { privateKey, ...draft } = await generateLedgerKeys(prfBytes);
      discardLedgerDraft(draft.keyId);
      pendingLedger.set(draft.keyId, { key: privateKey, expiresAt: Date.now() + PENDING_TTL, timer: setTimeout(() => discardLedgerDraft(draft.keyId), PENDING_TTL) });
      return draft;
    } finally {
      wipe(prfBytes);
    }
  },

  async "ledger.activate"({ keyId }) {
    const p = pendingLedger.get(str(keyId)) ?? fail("unknown_handle");
    discardLedgerDraft(keyId);
    if (p.expiresAt <= Date.now()) fail("unknown_handle");
    ledgerKeys.clear(); // one unlocked ledger key at a time
    ledgerKeys.set(keyId, p.key);
    return null;
  },

  async "ledger.discardPending"({ keyId }) {
    discardLedgerDraft(str(keyId));
    return null;
  },

  async "ledger.unlock"({ keyId, envelope, recoveryCode, prf }) {
    const prfBytes = prf === undefined ? undefined : bytes(prf);
    try {
      const material = recoveryCode !== undefined ? str(recoveryCode, 128) : prfBytes ?? fail("invalid_input");
      if (typeof material === "string" && !/^ROUT-RCVR-[A-F0-9]{64}$/.test(material)) fail("invalid_input");
      let key: CryptoKey;
      try {
        key = await unlockLedgerKey(envelope, str(keyId), material);
      } catch {
        return fail("decrypt_failed");
      }
      ledgerKeys.clear();
      ledgerKeys.set(keyId, key);
      return null;
    } finally {
      wipe(prfBytes);
    }
  },

  async "ledger.decrypt"({ keyId, items }) {
    const key = ledgerKeys.get(str(keyId)) ?? fail("unknown_handle");
    if (!Array.isArray(items) || items.length > 500) fail("invalid_input");
    const out: Record<string, string> = {};
    for (const item of items) {
      try {
        out[str(item.id, 100)] = JSON.stringify(await decryptLedgerEvent(key, str(item.payload, 65536)));
      } catch (e) {
        if (e instanceof EnclaveFailure) throw e;
        fail("decrypt_failed");
      }
    }
    return out;
  },

  async "ledger.lock"({ keyId }) {
    if (keyId === undefined) {
      ledgerKeys.clear();
      for (const id of [...pendingLedger.keys()]) discardLedgerDraft(id);
    } else {
      ledgerKeys.delete(str(keyId));
    }
    return null;
  },

  async "protocol.identity"({ userId }) {
    return { did: (await withIdentity(str(userId, 200), async (_sk, did) => did)) };
  },

  async "protocol.sealEvent"({ userId, stream, seq, prev, kind, plaintext, capId }) {
    const pt = bytes(plaintext);
    try {
      if (pt.byteLength > MAX_PLAINTEXT_BYTES) fail("invalid_input");
      if (!isStreamId(stream) || !Number.isSafeInteger(seq) || seq < 1) fail("invalid_input");
      const k = str(kind, 64);
      if (k === "stream.genesis" || k === "cap.revoke" || k.startsWith("pub.")) fail("invalid_input");
      const dk = await deviceKeyFor(userId);
      const blob = await sealBytes(dk.key, pt, eventAad(stream, k));
      return await withIdentity(str(userId, 200), async (sk) => {
        const event = signEvent(sk, { stream, seq, prev: prev === null ? null : str(prev, 64), kind: k, body: { sealed: { blob, keyId: dk.keyId } }, ...(capId ? { capId: str(capId, 64) } : {}) });
        if (!verifyEvent(event).ok) fail("invalid_input");
        return event;
      });
    } finally {
      wipe(pt);
    }
  },

  async "protocol.signEvent"({ userId, draft }) {
    if (!draft || typeof draft !== "object") fail("invalid_input");
    const kind = str(draft.kind, 64);
    if (kind !== "stream.genesis" && kind !== "cap.revoke" && !kind.startsWith("pub.")) fail("invalid_input"); // private kinds go through sealEvent
    return withIdentity(str(userId, 200), async (sk) => {
      const e = signEvent(sk, draft);
      const v = verifyEvent(e);
      if (!v.ok) fail("invalid_input");
      return e;
    });
  },

  async "protocol.openEvent"({ userId, event }) {
    const verified = verifyEvent(event, event?.ts ?? 0);
    if (!verified.ok) fail("invalid_input");
    const blob = event?.body?.sealed?.blob;
    if (!isStreamId(event?.stream) || typeof blob !== "string") fail("invalid_input");
    const dk = await deviceKeyFor(userId);
    if (event.body.sealed?.keyId !== dk.keyId) fail("decrypt_failed");
    return { plaintext: await openBytes(dk.key, str(blob, 70000), eventAad(event.stream, str(event.kind, 64))) };
  },

  async "protocol.dpop"({ userId, method, url }) {
    const m = str(method, 10).toUpperCase();
    if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(m)) fail("invalid_input");
    return withIdentity(str(userId, 200), async (sk) => ({ proof: createDpopProof(sk, m, str(url, 2048)) }));
  },

  async "protocol.delegate"({ userId, grant, parent }) {
    if (!grant || typeof grant !== "object") fail("invalid_input");
    return withIdentity(str(userId, 200), async (sk, did) => {
      const cap = issueCapability(sk, did, grant, parent ?? null);
      return cap;
    });
  },

  async "protocol.verifyChain"({ events }) {
    if (!Array.isArray(events)) fail("invalid_input");
    return verifyChain(events);
  },

  async "bhm.match"({ clientId, hashes, identities }) {
    if (!Array.isArray(hashes) || !Array.isArray(identities) || identities.length > 50) fail("invalid_input");
    const wanted = new Set(hashes.slice(0, BHM_MAX_HASHES).filter((h) => typeof h === "string" && /^[0-9a-f]{64}$/.test(h)));
    const cid = str(clientId, 200);
    const hits: number[] = [];
    for (let i = 0; i < identities.length; i++) {
      const id = identities[i];
      if (!id || !isBhmKind(id.kind) || typeof id.value !== "string") continue;
      const input = enc.encode(bhmPreimage(cid, { kind: id.kind, value: id.value }));
      try {
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
        const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
        wipe(digest);
        if (wanted.has(hex)) hits.push(i);
      } finally {
        wipe(input);
      }
    }
    return hits;
  },

  async "hash.sha256Hex"({ text }) {
    const input = enc.encode(str(text, 4096));
    try {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
      return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
    } finally {
      wipe(input);
    }
  },
};

export function isEnclaveOp(op: unknown): op is EnclaveOp {
  return typeof op === "string" && Object.prototype.hasOwnProperty.call(handlers, op);
}

/** Runs one request; never leaks error messages (they could contain data), only codes. */
export async function runEnclaveOp(op: EnclaveOp, args: unknown): Promise<{ ok: true; result: unknown } | { ok: false; code: EnclaveErrorCode }> {
  try {
    if (!isEnclaveOp(op)) fail("invalid_input");
    if (typeof args !== "object" || args === null) fail("invalid_input");
    const result = await (handlers[op] as (a: unknown) => Promise<unknown>)(args);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, code: e instanceof EnclaveFailure ? e.code : "internal" };
  } finally {
    wipeMessage(args);
  }
}
