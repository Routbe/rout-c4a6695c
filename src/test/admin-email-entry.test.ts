import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ admin: false, unavailable: false }));
vi.mock("@/lib/neon", () => ({ sql: vi.fn(async () => {
  if (state.unavailable) throw new Error("database unavailable");
  return state.admin ? [{ exists: 1 }] : [];
}), hasDatabase: () => true }));
vi.mock("@/lib/better-auth.server", () => ({
  createRoutAuth: vi.fn(() => ({ handler: async () => Response.json({ reachedAuth: true }) })),
  isProviderConfigured: () => false, missingProviderKeys: () => [],
  resolveAuthSecret: () => "test-secret",
}));
vi.mock("@/lib/altcha.server", () => ({ verifyAltcha: async () => ({ ok: true }), identityNeedsHardChallenge: async () => false, throttleHashForEmail: () => "hash" }));
vi.mock("@/lib/rate-limit-db.server", () => ({ hitRateLimit: async () => ({ ok: true }), clientIp: () => "test" }));
import { canUseAdminEmail } from "@/lib/auth/owner-admin.server";
import { handleAuthRequest } from "@/routes/api_.auth.$";
beforeEach(() => {
  vi.stubEnv("APP_MODE", "admin"); vi.stubEnv("OWNER_EMAILS", "owner@example.com");
  state.admin = false; state.unavailable = false;
});
afterEach(() => vi.unstubAllEnvs());
function request(path: string, email: unknown) {
  return handleAuthRequest({ request: new Request(`http://localhost/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }) });
}
describe("sign-in gateway", () => {
  for (const mode of ["admin", "public"]) {
    for (const path of ["/sign-up/email", "/forget-password"]) {
      it(`refuses ${path} in ${mode} mode with method_disabled`, async () => {
        vi.stubEnv("APP_MODE", mode);
        const res = await request(path, "owner@example.com");
        expect(res.status).toBe(410);
        expect((await res.json()).code).toBe("method_disabled");
      });
    }
    for (const path of ["/sign-in/email", "/sign-in/magic-link", "/request-password-reset"]) {
      it(`lets ${path} through in ${mode} mode`, async () => {
        vi.stubEnv("APP_MODE", mode);
        const res = await request(path, "owner@example.com");
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ reachedAuth: true });
      });
    }
  }
  it("lets the passkey ceremony through and demands user verification", async () => {
    vi.stubEnv("APP_MODE", "public");
    const res = await request("/passkey/generate-authenticate-options", undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reachedAuth: true, userVerification: "required" });
  });
  it("still recognises configured owners for the admin portal", async () => {
    expect(await canUseAdminEmail(" OWNER@example.com ")).toBe(true);
    state.admin = true;
    expect(await canUseAdminEmail("admin@example.com")).toBe(true);
  });
  it("refuses missing email and database failures", async () => {
    expect(await canUseAdminEmail(undefined)).toBe(false);
    state.unavailable = true;
    expect(await canUseAdminEmail("member@example.com")).toBe(false);
  });
});
