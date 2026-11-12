/**
 * Enclave-only storage of the member's RVE1 device key (opens vcc_ envelopes).
 * Only the 32-byte seed is secret, and it is stored ONLY sealed (AES-256-GCM)
 * under the member's Master-Key-derived device key; the public key and its id
 * are kept alongside for sealing. Imported by the enclave core only.
 */
const DB_NAME = "rout-vault-keys";
const STORE = "device";

export type StoredRve1Key = { kid: string; publicKey: string; sealedSeed: string; keyId: string };

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
      transaction.onabort = () => reject(transaction.error ?? new Error("Vault key transaction aborted"));
      transaction.onerror = () => reject(transaction.error);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

export async function loadRve1Key(userId: string): Promise<StoredRve1Key | null> {
  if (typeof indexedDB === "undefined") return null;
  const v = (await tx("readonly", (s) => s.get(userId))) as Partial<StoredRve1Key> | undefined;
  return v && isStr(v.kid, 64) && isStr(v.publicKey, 4096) && isStr(v.sealedSeed, 512) && isStr(v.keyId, 200)
    ? { kid: v.kid, publicKey: v.publicKey, sealedSeed: v.sealedSeed, keyId: v.keyId }
    : null;
}

export async function saveRve1Key(userId: string, value: StoredRve1Key): Promise<void> {
  await tx("readwrite", (s) => s.put(value, userId));
}

export const rve1SeedAad = (userId: string, kid: string) => `rout.vault.member-device.v1:${userId}:${kid}`;
