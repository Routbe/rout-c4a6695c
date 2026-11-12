import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAuthRequest } from "@/routes/api_.auth.$";

/**
 * Passkey-only: social providers can only be LINKED. An unconfigured provider
 * still fails with a readable `provider_not_configured` (400), never a 500.
 */

const PROVIDER_ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITLAB_CLIENT_ID",
  "GITLAB_CLIENT_SECRET",
  "APPLE_CLIENT_ID",
  "APPLE_CLIENT_SECRET",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_DISCOVERY_URL",
  "INFOMANIAK_CLIENT_ID",
  "INFOMANIAK_CLIENT_SECRET",
  // Cleared too so the "not blocked" cases fail deterministically on config
  // instead of trying to reach a real database.
  "DATABASE_URL",
  "NEON_API_KEY",
  "LOVABLE_API_KEY",
  "BETTER_AUTH_SECRET",
  "SESSION_SECRET",
];

function clearEnv() {
  for (const key of PROVIDER_ENV_KEYS) vi.stubEnv(key, "");
}

function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(request: Request) {
  return handleAuthRequest({ request });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("auth handler with missing OAuth credentials", () => {
  it("reports a missing account database before any passkey ceremony", async () => {
    clearEnv();
    const res = await call(post("/api/auth/passkey/generate-authenticate-options", {}));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "missing_database" });
  }, 30_000);

  it("routes public Google and Infomaniak sign-in to credential checks, not method_disabled", async () => {
    clearEnv();
    const res = await call(post("/api/auth/sign-in/social", { provider: "github", callbackURL: "/dashboard" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("provider_not_configured");
    const generic = await call(post("/api/auth/sign-in/oauth2", { providerId: "infomaniak" }));
    expect(generic.status).toBe(400);
    expect(await generic.json()).toMatchObject({ code: "provider_not_configured", provider: "infomaniak" });
  }, 30_000);

  it("refuses linking an unconfigured provider with provider_not_configured (400)", async () => {
    clearEnv();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await call(post("/api/auth/link-social", { provider: "github", callbackURL: "/settings" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; provider: string };
    expect(body.code).toBe("provider_not_configured");
    expect(body.provider).toBe("github");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("GITHUB_CLIENT_ID"));

    const callback = await call(new Request("http://localhost/api/auth/callback/google"));
    expect(callback.status).toBe(400);
    expect(((await callback.json()) as { code: string }).code).toBe("provider_not_configured");
  });

  it("lets a fully configured provider through the link guard", async () => {
    clearEnv();
    vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(post("/api/auth/link-social", { provider: "github", callbackURL: "/settings" }));
    const body = (await res.json()) as { code: string };
    expect(body.code).not.toBe("provider_not_configured");
  });
});
