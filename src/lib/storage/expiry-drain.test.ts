import { describe, expect, it } from "vitest";
import { drainExpired, type DrainCursor } from "./expiry-drain";

const rows = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, expiresAt: `2026-01-0${i + 1}T00:00:00Z` }));
const page = (store: typeof rows) => async (cursor: DrainCursor, limit: number) =>
  store.filter((r) => !cursor || r.expiresAt > cursor.expiresAt || (r.expiresAt === cursor.expiresAt && r.id > cursor.id)).slice(0, limit);

describe("expired file cleanup", () => {
  it("removes everything across several batches, oldest first", async () => {
    const store = [...rows];
    const order: string[] = [];
    const out = await drainExpired({ fetchBatch: page(store), batchSize: 3, remove: async (r) => { order.push(r.id); store.splice(store.indexOf(r), 1); } });
    expect(out).toEqual({ removed: 7, failed: 0, more: false });
    expect(order).toEqual(rows.map((r) => r.id));
  });

  it("a broken object is kept for the next run and does not block the rest", async () => {
    const store = [...rows];
    const out = await drainExpired({
      fetchBatch: page(store), batchSize: 2,
      remove: async (r) => { if (r.id === "r0") throw new Error("storage 403"); store.splice(store.indexOf(r), 1); },
    });
    expect(out).toEqual({ removed: 6, failed: 1, more: false });
    expect(store.map((r) => r.id)).toEqual(["r0"]);
  });

  it("stops at the time budget and says more work remains", async () => {
    let t = 0;
    const out = await drainExpired({ fetchBatch: page([...rows]), batchSize: 3, budgetMs: 3, now: () => t, remove: async () => { t += 1; } });
    expect(out).toEqual({ removed: 3, failed: 0, more: true });
  });
});
