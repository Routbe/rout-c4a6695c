/**
 * UI-thread side of the cryptographic enclave. Contains NO crypto: it only
 * posts typed messages to crypto.worker.ts and resolves the replies. There is
 * deliberately no main-thread fallback — without a worker, crypto refuses.
 */
import type { EnclaveArgs, EnclaveErrorCode, EnclaveOp, EnclaveRequest, EnclaveResponse, EnclaveResult, LedgerDraft, SealedForUser, VaultSummary } from "./protocol";
import type { PrivateEnvelope } from "@/lib/ledger/crypto";
import type { Capability, CapabilityGrant } from "@/lib/protocol/capabilities";
import type { EventDraft, SignedEvent } from "@/lib/protocol/events";
import type { RecoveryVault } from "@/lib/recovery/vault";
import { wipeMessage } from "@/lib/crypto/wipe";

export type { LedgerDraft, SealedForUser, VaultSummary } from "./protocol";

export class EnclaveError extends Error {
  constructor(readonly code: EnclaveErrorCode) {
    super(`enclave:${code}`);
  }
}

const TIMEOUT_MS = 120_000; // RSA-3072 generation on slow phones can take a while
type Waiter = { resolve: (v: unknown) => void; reject: (e: EnclaveError) => void; timer: ReturnType<typeof setTimeout>; started: boolean; owner: Worker };

let worker: Worker | null = null;
let seq = 0;
let epoch = 0;
let cancellation: AbortController | null = null;
const waiting = new Map<number, Waiter>();

/** Fence asynchronous UI/HTTP continuations across account changes or worker termination. */
export function captureEnclaveScope() {
  if (!cancellation) cancellation = new AbortController();
  const at = epoch;
  return {
    signal: cancellation.signal,
    assertCurrent: () => { if (at !== epoch) throw new EnclaveError("enclave_crashed"); },
  };
}

function rejectAll(code: EnclaveErrorCode) {
  for (const [id, w] of waiting) {
    clearTimeout(w.timer);
    w.reject(new EnclaveError(code));
    waiting.delete(id);
  }
}

/** Drops volatile worker state; persisted non-extractable device keys are unchanged. */
export function terminateEnclave(code: EnclaveErrorCode = "enclave_crashed"): void {
  epoch++;
  cancellation?.abort();
  cancellation = null;
  const previous = worker;
  worker = null;
  previous?.terminate();
  rejectAll(code);
}

function deadline(w: Worker) {
  return setTimeout(() => { if (worker === w) terminateEnclave("timeout"); }, TIMEOUT_MS);
}

function queueProgress(w: Worker) {
  for (const waiter of waiting.values()) {
    if (waiter.owner !== w || waiter.started) continue;
    clearTimeout(waiter.timer);
    waiter.timer = deadline(w);
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  if (typeof window === "undefined" || typeof Worker === "undefined") throw new EnclaveError("enclave_unavailable");
  let w: Worker;
  try {
    w = new Worker(new URL("./crypto.worker.ts", import.meta.url), { type: "module", name: "rout-crypto-enclave" });
  } catch {
    throw new EnclaveError("enclave_unavailable");
  }
  w.onmessage = (event: MessageEvent<EnclaveResponse>) => {
    const msg = event.data;
    if (worker !== w) { wipeMessage(msg); return; }
    if (!msg || !Number.isSafeInteger(msg.id) || (!("started" in msg && msg.started === true) && !("ok" in msg && typeof msg.ok === "boolean"))) {
      wipeMessage(msg);
      if (worker === w) terminateEnclave();
      return;
    }
    const waiter = waiting.get(msg.id);
    if (!waiter || worker !== w) {
      wipeMessage(msg);
      return;
    }
    queueProgress(w);
    if ("started" in msg) {
      clearTimeout(waiter.timer);
      waiter.started = true;
      waiter.timer = deadline(w);
      return;
    }
    waiting.delete(msg.id);
    clearTimeout(waiter.timer);
    if (msg.ok) waiter.resolve(msg.result);
    else waiter.reject(new EnclaveError(msg.code));
  };
  w.onerror = w.onmessageerror = () => {
    if (worker === w) terminateEnclave();
  };
  worker = w;
  return w;
}

export function callEnclave<K extends EnclaveOp>(op: K, args: EnclaveArgs<K>, transfer: Transferable[] = []): Promise<EnclaveResult<K>> {
  // Disposal must never recreate a worker after a crash, timeout or logout.
  if (!worker && (op === "vault.discard" || op === "masterKey.discardPending" || op === "ledger.discardPending" || op === "ledger.lock")) {
    return Promise.resolve(null as EnclaveResult<K>);
  }
  return new Promise<EnclaveResult<K>>((resolve, reject) => {
    let w: Worker;
    try {
      w = getWorker();
    } catch (e) {
      wipeMessage(args);
      reject(e instanceof EnclaveError ? e : new EnclaveError("enclave_unavailable"));
      return;
    }
    const id = ++seq;
    const timer = deadline(w);
    waiting.set(id, { resolve: resolve as (v: unknown) => void, reject, timer, started: false, owner: w });
    try {
      w.postMessage({ id, op, args } as EnclaveRequest, transfer);
    } catch {
      waiting.delete(id);
      clearTimeout(timer);
      wipeMessage(args);
      reject(new EnclaveError("invalid_input"));
    }
  });
}

const moved = (b?: Uint8Array): Transferable[] => (b ? [b.buffer as ArrayBuffer] : []);

/** Typed façade. Uint8Array arguments are transferred: the caller's copy becomes empty. */
export const enclave = {
  vault: {
    prepare: (secret: string) => callEnclave("vault.prepare", { secret }),
    decrypt: (handle: string, vaultId: string, blob: string, expiresAt: string): Promise<VaultSummary> =>
      callEnclave("vault.decrypt", { handle, vaultId, blob, expiresAt }),
    reseal: (handle: string, userId: string): Promise<SealedForUser> => callEnclave("vault.reseal", { handle, userId }),
    discard: (handle: string) => callEnclave("vault.discard", { handle }),
  },
  deviceKey: {
    status: (userId: string) => callEnclave("deviceKey.status", { userId }),
  },
  masterKey: {
    generate: () => callEnclave("masterKey.generate", {}),
    commitPending: (handle: string, userId: string) => callEnclave("masterKey.commitPending", { handle, userId }),
    discardPending: (handle: string) => callEnclave("masterKey.discardPending", { handle }),
    unlock: (userId: string, mnemonic: string) => callEnclave("masterKey.unlock", { userId, mnemonic }),
  },
  data: {
    /** UI → worker plaintext, worker → UI ciphertext (ready for the database). */
    seal: (userId: string, aad: string, data: unknown): Promise<SealedForUser> => {
      const plaintext = new TextEncoder().encode(JSON.stringify(data));
      return callEnclave("data.seal", { userId, aad, plaintext }, moved(plaintext));
    },
    open: async <T = unknown>(userId: string, aad: string, blob: string): Promise<T> => {
      const { plaintext } = await callEnclave("data.open", { userId, aad, blob });
      try {
        return JSON.parse(new TextDecoder().decode(plaintext)) as T;
      } finally {
        plaintext.fill(0);
      }
    },
  },
  ledger: {
    generate: (prf?: Uint8Array): Promise<LedgerDraft> => callEnclave("ledger.generate", prf ? { prf } : {}, moved(prf)),
    activate: (keyId: string) => callEnclave("ledger.activate", { keyId }),
    discardPending: (keyId: string) => callEnclave("ledger.discardPending", { keyId }),
    unlock: (keyId: string, envelope: PrivateEnvelope, material: { recoveryCode: string } | { prf: Uint8Array }) =>
      callEnclave("ledger.unlock", { keyId, envelope, ...material }, "prf" in material ? moved(material.prf) : []),
    decrypt: (keyId: string, items: { id: string; payload: string }[]) => callEnclave("ledger.decrypt", { keyId, items }),
    lock: (keyId?: string) => callEnclave("ledger.lock", keyId ? { keyId } : {}),
  },
  recovery: {
    create: (mnemonic: string) => callEnclave("recovery.create", { mnemonic }),
    check: (vault: RecoveryVault, shard: string) => callEnclave("recovery.check", { vault, shard }),
    sealShard: (prf: Uint8Array, shard: string, vaultId: string) => callEnclave("recovery.sealShard", { prf, shard, vaultId }, moved(prf)),
    openShard: (prf: Uint8Array, blob: string, vaultId: string) => callEnclave("recovery.openShard", { prf, blob, vaultId }, moved(prf)),
    restore: (userId: string, vault: RecoveryVault, shards: string[], practice = false) => callEnclave("recovery.restore", { userId, vault, shards, practice }),
  },
  pairwise: {
    claim: (root: Uint8Array, sector: string, nonce: string) => callEnclave("pairwise.claim", { root, sector, nonce }, moved(root)),
  },
  hash: {
    sha256Hex: (text: string) => callEnclave("hash.sha256Hex", { text }),
  },
  bhm: {
    match: (clientId: string, hashes: string[], identities: { kind: string; value: string }[]) =>
      callEnclave("bhm.match", { clientId, hashes, identities }),
  },
  protocol: {
    verifyChain: (events: SignedEvent[]) => callEnclave("protocol.verifyChain", { events }),
    identity: (userId: string) => callEnclave("protocol.identity", { userId }),
    /** UI → worker plaintext (transferred), worker → UI a signed, ciphertext-only event. */
    sealEvent: (userId: string, at: { stream: string; seq: number; prev: string | null; kind: string; capId?: string }, data: unknown): Promise<SignedEvent> => {
      const plaintext = new TextEncoder().encode(JSON.stringify(data));
      return callEnclave("protocol.sealEvent", { userId, ...at, plaintext }, moved(plaintext));
    },
    signEvent: (userId: string, draft: EventDraft) => callEnclave("protocol.signEvent", { userId, draft }),
    openEvent: async <T = unknown>(userId: string, event: SignedEvent): Promise<T> => {
      const { plaintext } = await callEnclave("protocol.openEvent", { userId, event });
      try {
        return JSON.parse(new TextDecoder().decode(plaintext)) as T;
      } finally {
        plaintext.fill(0);
      }
    },
    dpop: async (userId: string, method: string, url: string) => (await callEnclave("protocol.dpop", { userId, method, url })).proof,
    delegate: (userId: string, grant: CapabilityGrant, parent?: Capability | null) => callEnclave("protocol.delegate", { userId, grant, parent: parent ?? null }),
  },
};
