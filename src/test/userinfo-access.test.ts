import { describe, expect, it, vi } from "vitest";
import { handleUserInfo, type UserInfoDeps } from "@/lib/oauth/userinfo-handler";

class OAuthError extends Error {}
class ScopeForbiddenError extends Error {
  constructor(readonly code: string) { super(code); }
}

function deps(overrides: Partial<UserInfoDeps> = {}): UserInfoDeps {
  return {
    verifyAccessToken: vi.fn(async () => ({ sub: "s", userId: "u", scopes: ["openid"], clientId: "c", acr: null })),
    generateUserInfoResponse: vi.fn(async () => ({ sub: "s" })),
    isOAuthError: (e): e is Error => e instanceof OAuthError,
    isScopeForbidden: (e): e is ScopeForbiddenError => e instanceof ScopeForbiddenError,
    ...overrides,
  };
}
const req = (auth?: string) =>
  new Request("https://rout.be/api/public/oauth/userinfo", auth ? { headers: { authorization: auth } } : {});

describe("userinfo access", () => {
  it("returns 401 without a bearer token and never verifies", async () => {
    const d = deps();
    expect((await handleUserInfo(req(), d)).status).toBe(401);
    expect((await handleUserInfo(req("Bearer "), d)).status).toBe(401);
    expect((await handleUserInfo(req("Basic abc"), d)).status).toBe(401);
    expect(d.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid token", async () => {
    const d = deps({ verifyAccessToken: vi.fn(async () => { throw new OAuthError("Ongeldig token."); }) });
    const res = await handleUserInfo(req("Bearer x.y.z"), d);
    expect(res.status).toBe(401);
    expect(d.generateUserInfoResponse).not.toHaveBeenCalled();
  });

  it("returns 403 when the token lacks the scope", async () => {
    const d = deps({ generateUserInfoResponse: vi.fn(async () => { throw new ScopeForbiddenError("scope_missing"); }) });
    expect((await handleUserInfo(req("Bearer a.b.c"), d)).status).toBe(403);
  });

  it("hides database errors behind a generic message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      verifyAccessToken: vi.fn(async () => { throw new Error('relation "oauth_access_tokens" denied for jan@rout.be'); }),
    });
    const res = await handleUserInfo(req("Bearer a.b.c"), d);
    const body = (await res.json()) as { error_description: string };
    expect(res.status).toBe(503);
    expect(body.error_description).toBe("Er is een tijdelijk verbindingsprobleem opgetreden.");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("jan@rout.be");
    spy.mockRestore();
  });
});
