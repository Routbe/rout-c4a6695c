import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { query: string; ctx: string | null }[] = [];
let current: string | null = null;
let resolveResult: unknown[] = [];

vi.mock("@/lib/neon", () => {
  const sql = (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    calls.push({ query, ctx: current });
    if (query.includes("rout_resolve_account")) return Promise.resolve(resolveResult);
    if (query.includes("insert into public.users")) {
      return Promise.resolve([{ id: current, email: "a@b.be", user_metadata: {}, created_at: "now" }]);
    }
    return Promise.resolve([]);
  };
  return {
    sql,
    withDbContext: async (ctx: { userId: string | null }, fn: () => Promise<unknown>) => {
      const prev = current;
      current = ctx.userId;
      try { return await fn(); } finally { current = prev; }
    },
  };
});
vi.mock("@/lib/auth/owner-admin.server", () => ({ ensureOwnerAdmin: async () => undefined }));

const AUTH_ID = "11111111-1111-4111-8111-111111111111";

describe("login → member account bridge", () => {
  beforeEach(() => { calls.length = 0; resolveResult = []; });

  it("creates a first-time member inside that member's own database scope", async () => {
    const { bridgeIdentity } = await import("@/lib/auth/bridge.server");
    const user = await bridgeIdentity({ id: AUTH_ID, email: "A@B.be", name: null, image: null, emailVerified: true });
    expect(user?.id).toBe(AUTH_ID);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.ctx === AUTH_ID)).toBe(true);
  });

  it("never runs account queries without a scope", async () => {
    const { bridgeIdentity } = await import("@/lib/auth/bridge.server");
    await bridgeIdentity({ id: AUTH_ID, email: "a@b.be", name: null, image: null, emailVerified: false });
    expect(calls.some((c) => c.ctx === null)).toBe(false);
  });

  it("rejects malformed identity ids before touching the database", async () => {
    const { bridgeIdentity } = await import("@/lib/auth/bridge.server");
    expect(await bridgeIdentity({ id: "not-a-uuid", email: "a@b.be", name: null, image: null, emailVerified: true })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
