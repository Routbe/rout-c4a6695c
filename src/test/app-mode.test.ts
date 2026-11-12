import { afterEach, describe, expect, it, vi } from "vitest";
import { appMode, modeDecision, socialLoginAllowed } from "@/lib/app-mode";
afterEach(() => { vi.unstubAllEnvs(); });

describe("app mode split", () => {
  it("public mode returns 404 for admin pages and admin API", () => {
    expect(modeDecision("public", "/admin")).toEqual({ kind: "notFound" });
    expect(modeDecision("public", "/admin/custom-badges")).toEqual({ kind: "notFound" });
    expect(modeDecision("public", "/api/admin/users")).toEqual({ kind: "notFound" });
    expect(modeDecision("public", "/@jona")).toEqual({ kind: "allow" });
  });

  it("admin mode redirects the root and public profiles to the admin sign-in", () => {
    expect(modeDecision("admin", "/").kind).toBe("redirect");
    expect(modeDecision("admin", "/@jona").kind).toBe("redirect");
    expect(modeDecision("admin", "/admin")).toEqual({ kind: "allow" });
    expect(modeDecision("admin", "/auth/sign-in")).toEqual({ kind: "allow" });
  });

  it("admin mode refuses social login", () => {
    expect(socialLoginAllowed("admin")).toBe(false);
    expect(socialLoginAllowed("public")).toBe(true);
  });
  it("admin sign-in can read provider status and clear the session", () => {
    expect(modeDecision("admin", "/api/public/auth/providers")).toEqual({ kind: "allow" });
    expect(modeDecision("admin", "/api/public/session/logout")).toEqual({ kind: "allow" });
  });
  it("admin rejects registration, public OAuth and extension bypasses", () => {
    for (const path of ["/auth/sign-up", "/auth/bluesky", "/api/public/oauth/token", "/api/public/users.json", "/authentication", "/api/public/cronology"]) expect(modeDecision("admin", path).kind).toBe("redirect");
  });
  it("a pinned public build cannot be reopened by a server override", () => {
    vi.stubEnv("VITE_APP_MODE", "public"); vi.stubEnv("APP_MODE", "admin");
    expect(appMode()).toBe("public");
  });
});
