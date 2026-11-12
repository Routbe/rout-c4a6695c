/**
 * Small per-instance stale-while-revalidate cache for dashboard aggregates.
 * Keyed per user + scope, so no figures ever cross personal/workspace scopes.
 * Fresh for maxAgeMs; afterwards the stale value is returned while one refresh runs.
 */
export function createSwrCache<T>(maxAgeMs: number, maxEntries = 500, now: () => number = Date.now) {
  const store = new Map<string, { value: T; at: number; refreshing?: Promise<T> }>();
  return {
    async get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = store.get(key);
      if (hit && now() - hit.at < maxAgeMs) return hit.value;
      if (hit) {
        if (!hit.refreshing) {
          hit.refreshing = load()
            .then((value) => { store.set(key, { value, at: now() }); return value; })
            .catch(() => { hit.refreshing = undefined; return hit.value; });
        }
        return hit.value;
      }
      const value = await load();
      if (store.size >= maxEntries) store.delete(store.keys().next().value as string);
      store.set(key, { value, at: now() });
      return value;
    },
    clear: () => store.clear(),
  };
}

export const dashboardCache = createSwrCache<{ saved: number; tracked: number; scans: number; trend: number[] }>(60_000);
