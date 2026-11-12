import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Admins must have 2FA switched on, and can never switch it off. */
const state = vi.hoisted(() => ({ admin: true, twoFactor: false }));
vi.mock("@/lib/neon", () => ({
  hasDatabase: () => true,
  sql: vi.fn(async (strings: TemplateStringsArray) => {
    const q = strings.join("?");
    if (/twoFactorEnabled/.test(q)) return [{ on: state.twoFactor }];
    if (/from public\.users\s+where auth_user_id/.test(q)) return [{ id: "member-1" }];
    if (/user_roles|admin_permissions/.test(q)) return state.admin ? [{ "?column?": 1 }] : [];
    return [];
  }),
}));
vi.mock("@/lib/better-auth.server", () => ({
  createRoutAuth: vi.fn(() => ({
    api: { getSession: async () => ({ user: { id: "auth-1" } }) },
    handler: async () => Response.json({ reachedAuth: true }),
  })),
  isProviderConfigured: () => false,
  missingProviderKeys: () => [],
  resolveAuthSecret: () => ({ secret: "s".repeat(40) }),
}));

import { assertAdminRole } from "@/lib/admin.server";
import { handleAuthRequest } from "@/routes/api_.auth.$";

beforeEach(() => {
  vi.stubEnv("APP_MODE", "admin");
  state.admin = true;
  state.twoFactor = false;
});
afterEach(() => vi.unstubAllEnvs());

describe("admin 2FA requirement", () => {
  it("refuses admin tools while 2FA is off", async () => {
    await expect(assertAdminRole("member-1")).rejects.toThrow("admin_two_factor_required");
  });

  it("opens admin tools once 2FA is on", async () => {
    state.twoFactor = true;
    await expect(assertAdminRole("member-1")).resolves.toBeUndefined();
  });

  it("still refuses non-admins even with 2FA on", async () => {
    state.admin = false;
    state.twoFactor = true;
    await expect(assertAdminRole("member-1")).rejects.toThrow("Forbidden");
  });

  const disable = () =>
    handleAuthRequest({
      request: new Request("http://localhost/api/auth/two-factor/disable", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "better-auth.session_token=x" },
        body: "{}",
      }),
    });

  it("blocks admins from switching 2FA off", async () => {
    const res = await disable();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("admin_two_factor_required");
  });

  it("lets members switch 2FA off", async () => {
    state.admin = false;
    const res = await disable();
    expect(res.status).toBe(200);
  });
});
