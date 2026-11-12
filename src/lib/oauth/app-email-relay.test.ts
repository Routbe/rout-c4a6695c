import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailOptions, resolveAppEmail } from "./email-broker";

const RELAY = "priv-0123456789abcdef0123@mail.rout.be";

describe("relay as an e-mail choice", () => {
  it("offers the relay only next to a verified primary", () => {
    expect(emailOptions({ email: "j@mail.be", verified: true }, [], RELAY).map((o) => o.source)).toEqual(["primary", "relay"]);
    expect(emailOptions({ email: "j@mail.be", verified: false }, [], RELAY).map((o) => o.source)).toEqual(["primary"]);
  });
  it("gives the app the relay when chosen, else the primary", () => {
    const opts = emailOptions({ email: "j@mail.be", verified: true }, [], RELAY);
    expect(resolveAppEmail({ source: "relay", aliasId: null }, opts)?.email).toBe(RELAY);
    expect(resolveAppEmail({ source: "relay", aliasId: null }, emailOptions({ email: "j@mail.be", verified: true }, []))).toBeNull();
  });
});

// Server path with the database mocked: choice is stored, and userinfo claims return it.
const store = { assignment: null as Record<string, unknown> | null, ruleActive: false };
vi.mock("@/lib/neon", () => ({
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join("?");
    if (q.includes("from public.users u left join public.profiles")) return Promise.resolve([{ email: "j@mail.be", email_confirmed_at: "2026-01-01" }]);
    if (q.includes("from public.users where id")) return Promise.resolve([{ email: "j@mail.be", email_confirmed_at: "2026-01-01" }]);
    if (q.includes("from public.email_aliases")) return Promise.resolve([]);
    if (q.includes("insert into public.oauth_email_forwarding_rules")) { store.ruleActive = true; return Promise.resolve([{ alias_local: String(vals[2]) }]); }
    if (q.includes("insert into public.app_email_assignments")) {
      store.assignment = { source: vals[2], alias_id: vals[3], assigned_email: vals[4] };
      return Promise.resolve([]);
    }
    if (q.includes("from public.app_email_assignments")) return Promise.resolve(store.assignment ? [{ ...store.assignment, relay_status: store.ruleActive ? "active" : null }] : []);
    return Promise.resolve([]);
  },
}));

describe("app e-mail assignment (server)", () => {
  beforeEach(() => {
    store.assignment = null;
    store.ruleActive = false;
    process.env["ROUT_PROVIDER_PAIRWISE_SECRET"] = "s".repeat(40);
  });
  it("stores the relay choice and the claims return the relay address", async () => {
    const { assignAppEmail } = await import("./email-broker.server");
    await assignAppEmail("user-1", "client-a", "relay");
    expect(store.assignment?.["source"]).toBe("relay");
    expect(String(store.assignment?.["assigned_email"])).toMatch(/^priv-[a-f0-9]{20}@mail\.rout\.be$/);
    const { identityClaims } = await import("./provider.server");
    const claims = await identityClaims("user-1", ["openid", "email"], { clientId: "client-a" });
    expect(claims["email"]).toBe(store.assignment?.["assigned_email"]);
    expect(claims["email_verified"]).toBe(true);
  });
  it("a paused relay never falls back to the real address", async () => {
    const { assignAppEmail, appEmailFor } = await import("./email-broker.server");
    await assignAppEmail("user-1", "client-a", "relay");
    store.ruleActive = false;
    delete process.env["ROUT_PROVIDER_PAIRWISE_SECRET"];
    expect((await appEmailFor("user-1", "client-a"))?.email).toBe(store.assignment?.["assigned_email"]);
  });
  it("another app keeps the primary address", async () => {
    const { identityClaims } = await import("./provider.server");
    const claims = await identityClaims("user-1", ["openid", "email"], { clientId: "client-b" });
    expect(claims["email"]).toBe("j@mail.be");
  });
});
