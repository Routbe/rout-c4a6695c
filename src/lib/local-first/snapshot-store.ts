/**
 * Local-first snapshot store: the last known state of the member's OS
 * (dashboard widgets, relays, assets) lives in IndexedDB so the cockpit paints
 * instantly on the next visit, then revalidates in the background.
 * Falls back to memory when IndexedDB is unavailable (SSR, private mode).
 * Cleared on sign-out so nothing survives on a shared device.
 */
const DB_NAME = "rout-os";
const STORE = "snapshots";

export interface Snapshot<T> {
  value: T;
  savedAt: number;
}

const memory = new Map<string, Snapshot<unknown>>();
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

function run<R>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<R>): Promise<R | null> {
  return openDb().then(
    (db) =>
      new Promise<R | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function readSnapshot<T>(key: string): Promise<Snapshot<T> | null> {
  const hot = memory.get(key) as Snapshot<T> | undefined;
  if (hot) return hot;
  const stored = (await run<Snapshot<T>>("readonly", (s) => s.get(key))) ?? null;
  if (stored) memory.set(key, stored);
  return stored;
}

export async function writeSnapshot<T>(key: string, value: T): Promise<void> {
  const snap: Snapshot<T> = { value, savedAt: Date.now() };
  memory.set(key, snap);
  await run("readwrite", (s) => s.put(snap, key));
}

export async function clearSnapshots(): Promise<void> {
  memory.clear();
  await run("readwrite", (s) => s.clear());
}
