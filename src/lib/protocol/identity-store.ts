/**
 * Enclave-only storage of the member's protocol identity (Ed25519 secret key).
 * The secret key is stored ONLY sealed (AES-256-GCM) under the member's
 * Master-Key-derived device key, so IndexedDB alone never yields it, and a
 * device without the unlocked Master Key cannot sign. Imported by the enclave core only.
 */
const DB_NAME = "rout-protocol";
const STORE = "identity";

export type StoredIdentity = { did: string; sealedSecret: string; keyId: string };

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
      transaction.onabort = () => reject(transaction.error ?? new Error("Identity transaction aborted"));
      transaction.onerror = () => reject(transaction.error);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadIdentity(userId: string): Promise<StoredIdentity | null> {
  if (typeof indexedDB === "undefined") return null;
  const v = (await tx("readonly", (s) => s.get(userId))) as StoredIdentity | undefined;
  return v && typeof v.did === "string" && typeof v.sealedSecret === "string" ? v : null;
}

export async function saveIdentity(userId: string, value: StoredIdentity): Promise<void> {
  await tx("readwrite", (s) => s.put(value, userId));
}

export const identityAad = (userId: string, did: string) => `rout.protocol.identity.v1:${userId}:${did}`;
export const eventAad = (stream: string, kind: string) => `rout.protocol.event.v1:${stream}:${kind}`;
