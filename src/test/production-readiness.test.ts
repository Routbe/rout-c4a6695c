// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSwrCache } from "@/lib/dashboard-cache";

describe("dashboard SWR cache (60 s)", () => {
  it("serves fresh values without reloading, then stale while one refresh runs", async () => {
    let t = 0;
    let loads = 0;
    const c = createSwrCache<number>(60_000, 10, () => t);
    const load = async () => ++loads;
    expect(await c.get("u:personal", load)).toBe(1);
    t = 59_000;
    expect(await c.get("u:personal", load)).toBe(1);
    t = 61_000;
    expect(await c.get("u:personal", load)).toBe(1); // stale served
    await Promise.resolve(); await Promise.resolve();
    expect(await c.get("u:personal", load)).toBe(2);
    expect(loads).toBe(2);
  });
  it("keeps scopes apart", async () => {
    const c = createSwrCache<string>(60_000);
    expect(await c.get("u:personal", async () => "p")).toBe("p");
    expect(await c.get("u:ws1", async () => "w")).toBe("w");
  });
});

describe("missing credentials fail clearly", () => {
  it("Snapchat state check returns null without a secret", async () => {
    delete process.env["SNAPCHAT_CLIENT_ID"];
    delete process.env["SNAPCHAT_CLIENT_SECRET"];
    const s = await import("@/lib/snapchat.server");
    expect(s.snapchatConfigured()).toBe(false);
    expect(s.verifySnapState("snap.u.1.abc")).toBeNull();
  });
  it("storage without keys throws a clear not_configured message", async () => {
    const { StorageNotConfigured } = await import("@/lib/storage/s3.server");
    expect(new StorageNotConfigured().message).toMatch(/^not_configured: Scaleway[\s\S]*nog niet ingesteld/);
  });
});
