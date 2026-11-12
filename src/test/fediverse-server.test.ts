// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), validate: vi.fn() }));
vi.mock("@/lib/neon", () => ({ sql: mocks.sql }));
vi.mock("@/lib/security/ssrf-guard.server", () => ({ validateOutboundUrl: mocks.validate }));
import { readFediverseProfile, saveFediverseProfile } from "@/lib/fediverse-profile.server";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  mocks.sql.mockImplementation(async (parts: TemplateStringsArray) => {
    const text = parts.join("?");
    if (text.includes("select p.username")) return [{ username: "gebruiker", email_confirmed_at: "2026-11-01", subdomain_enabled: true, subdomain_tier: "root_lifetime", root_subdomain_status: "active" }];
    if (text.includes("returning handle")) return [{ handle: "https://instance.domain/@user" }];
    return [];
  });
  mocks.validate.mockImplementation(async (url: string) => new URL(url));
}
it("writes a pending outbound link then credits only reciprocal proof", async () => {
  setup();
  vi.stubGlobal("fetch", vi.fn(async () => new Response('<a href="https://gebruiker.rout.be/" rel="me">ROUT</a>', { headers: { "content-type": "text/html" } })));
  const identity = await saveFediverseProfile({ id: "one", emailConfirmedAt: "2026-11-01" }, "@user@instance.domain");
  expect(identity?.verified).toBe(true);
  const fetch = vi.mocked(globalThis.fetch);
  expect(fetch.mock.calls[0]?.[1]?.redirect).toBe("error");
  expect(mocks.sql.mock.calls.some(call => call[0].join("").includes("false,null,null"))).toBe(true);
});
it("unsafe destinations cannot establish proof", async () => {
  setup(); mocks.validate.mockRejectedValue(new Error("SSRF blocked"));
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await saveFediverseProfile({ id: "two", emailConfirmedAt: "2026-11-01" }, "@user@instance.domain"))?.verified).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it("unverified callers cannot write or make outbound requests", async () => {
  await expect(saveFediverseProfile({ id: "three", emailConfirmedAt: null }, "@user@instance.domain")).rejects.toMatchObject({ statusCode: 403 });
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("public reads reject stale ownership bindings and expose no private data", async () => {
  mocks.sql.mockResolvedValue([{ handle: "https://instance.domain/@user", verified: true, verified_at: new Date().toISOString(), verify_code: "relme:old-domain", urls: ["https://rout.be/@gebruiker"] }]);
  expect(await readFediverseProfile("owner")).toEqual({ url: "https://instance.domain/@user", verified: false });
  expect(mocks.sql.mock.calls[0]?.[0].join("")).toContain("read_public_fediverse");
});