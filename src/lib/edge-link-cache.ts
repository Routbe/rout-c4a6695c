/**
 * Edge resolve cache for short links. The resolver runs inside the Worker
 * isolate; this keeps recently resolved destinations in isolate memory so a
 * repeat scan skips the database round-trips. The `LinkCacheStore` interface is
 * the seam for a shared edge KV store later (same get/set contract).
 */
export interface CachedLink {
  id: string;
  targetUrl: string;
}

export interface LinkCacheStore {
  get(code: string): CachedLink | null | Promise<CachedLink | null>;
  set(code: string, value: CachedLink): void | Promise<void>;
}

/** Repointed or paused links take effect within this window. */
export const LINK_CACHE_TTL_MS = 15_000;
export const LINK_CACHE_MAX_ENTRIES = 5_000;

export class MemoryLinkCache implements LinkCacheStore {
  private readonly entries = new Map<string, { value: CachedLink; expiresAt: number }>();

  constructor(
    private readonly ttlMs = LINK_CACHE_TTL_MS,
    private readonly maxEntries = LINK_CACHE_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get(code: string): CachedLink | null {
    const hit = this.entries.get(code);
    if (!hit) return null;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(code);
      return null;
    }
    return hit.value;
  }

  set(code: string, value: CachedLink): void {
    this.entries.delete(code);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(code, { value, expiresAt: this.now() + this.ttlMs });
  }

  get size(): number {
    return this.entries.size;
  }
}

export const linkCache: LinkCacheStore = new MemoryLinkCache();
