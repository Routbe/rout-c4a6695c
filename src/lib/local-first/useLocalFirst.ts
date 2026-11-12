import { useCallback, useEffect, useRef, useState } from "react";
import { readSnapshot, writeSnapshot } from "./snapshot-store";

export interface LocalFirstState<T> {
  data: T | null;
  /** When the shown data was last confirmed by the server (ms epoch). */
  savedAt: number | null;
  syncing: boolean;
  error: Error | null;
  /** Optimistic local change: the UI updates now, the snapshot is persisted. */
  mutate: (update: (prev: T | null) => T) => void;
  refresh: () => Promise<void>;
}

/**
 * Stale-while-revalidate over the local snapshot store. Pass `key = null`
 * until the member is known; keys must include the user id.
 */
export function useLocalFirst<T>(key: string | null, fetcher: () => Promise<T>): LocalFirstState<T> {
  const [data, setData] = useState<T | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!key) return;
    setSyncing(true);
    try {
      const fresh = await fetcherRef.current();
      setData(fresh);
      setSavedAt(Date.now());
      setError(null);
      void writeSnapshot(key, fresh);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSyncing(false);
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    void readSnapshot<T>(key).then((snap) => {
      if (alive && snap) {
        setData((cur) => cur ?? snap.value);
        setSavedAt((cur) => cur ?? snap.savedAt);
      }
    });
    void refresh();
    return () => {
      alive = false;
    };
  }, [key, refresh]);

  const mutate = useCallback(
    (update: (prev: T | null) => T) => {
      setData((prev) => {
        const next = update(prev);
        if (key) void writeSnapshot(key, next);
        return next;
      });
    },
    [key],
  );

  return { data, savedAt, syncing, error, mutate, refresh };
}
