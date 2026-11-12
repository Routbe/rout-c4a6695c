/**
 * Durable on-device copy of unsent Studio edits (IndexedDB `rout-studio`).
 * `putStudioDraft` resolves true only after the transaction committed: there is
 * no memory fallback, so the UI never claims "stored on this device" when it is not.
 * Cleared on sign-out together with the other local-first data.
 */
const DB_NAME = "rout-studio";
const STORE = "drafts";

export interface StudioDraftRecord<T = unknown> {
  v: 1;
  value: T;
  fingerprint: string;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<{ ok: boolean; result: unknown }> {
  return openDb().then((db) => new Promise((resolve) => {
    if (!db) return resolve({ ok: false, result: null });
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve({ ok: true, result: req ? req.result : null });
      t.onerror = () => resolve({ ok: false, result: null });
      t.onabort = () => resolve({ ok: false, result: null });
    } catch {
      resolve({ ok: false, result: null });
    }
  }));
}

export async function putStudioDraft<T>(key: string, value: T, fingerprint: string): Promise<boolean> {
  const record: StudioDraftRecord<T> = { v: 1, value, fingerprint, savedAt: Date.now() };
  return (await tx("readwrite", (s) => s.put(record, key))).ok;
}

export async function getStudioDraft<T>(key: string): Promise<StudioDraftRecord<T> | null> {
  const { ok, result } = await tx("readonly", (s) => s.get(key));
  const r = ok ? (result as StudioDraftRecord<T> | undefined) : undefined;
  return r && r.v === 1 && typeof r.savedAt === "number" ? r : null;
}

export async function deleteStudioDraft(key: string): Promise<void> {
  await tx("readwrite", (s) => { s.delete(key); });
}

export async function clearStudioDrafts(): Promise<void> {
  await tx("readwrite", (s) => { s.clear(); });
}
