/**
 * The member's personal workspace key, browser only. Derived from the 24-word
 * Master Key (see recovery.ts) and kept on this device as a NON-extractable
 * CryptoKey in IndexedDB. Neither the Master Key nor this key ever leaves the
 * browser; the server only ever sees ciphertext and the public key id.
 */
import { b64u, deriveDek } from "./crypto";

const enc = new TextEncoder();
const DB_NAME = "rout-e2ee";
const STORE = "keys";

export type WorkspaceKey = { key: CryptoKey; keyId: string };

/** AES-256-GCM key + a 128-bit public key id (HKDF, different info) to tell keys apart. */
export async function workspaceKeyFromMaster(masterKey: Uint8Array): Promise<WorkspaceKey> {
  if (masterKey.length !== 32) throw new Error("Master Key must be 256 bits");
  const key = await deriveDek(masterKey, "rout.e2ee.workspace.v1");
  const base = await crypto.subtle.importKey("raw", masterKey as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("rout.e2ee.salt.v1"), info: enc.encode("rout.e2ee.keyid.v1") },
    base,
    128,
  );
  return { key, keyId: b64u.encode(new Uint8Array(bits)) };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const req = fn(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(req.result);
      transaction.onabort = () => reject(transaction.error ?? new Error("Device key transaction aborted"));
      transaction.onerror = () => reject(transaction.error);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const slot = (userId: string) => `workspace:${userId}`;

export async function loadDeviceKey(userId: string): Promise<WorkspaceKey | null> {
  if (typeof indexedDB === "undefined") return null;
  const v = (await tx("readonly", (s) => s.get(slot(userId)))) as WorkspaceKey | undefined;
  return v && v.key instanceof CryptoKey && typeof v.keyId === "string" ? v : null;
}

export async function saveDeviceKey(userId: string, value: WorkspaceKey): Promise<void> {
  if (value.key.extractable) throw new Error("Refusing to store an extractable key");
  await tx("readwrite", (s) => s.put(value, slot(userId)));
}

export async function forgetDeviceKey(userId: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(slot(userId)));
}
