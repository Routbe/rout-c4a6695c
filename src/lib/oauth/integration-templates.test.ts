import { describe, expect, it } from "vitest";
import { claimsForScopes, buildAiPrompt, buildPrismaSchema, buildSqlSchema, DISCOVERY_URL } from "./integration-templates";
import { hintFor } from "./debug-hints";

const app = {
  clientId: "rout_abc",
  scopes: ["openid", "email"],
  redirectUris: ["https://x.be/cb"],
  requirePkce: true,
  richIdentityEnabled: true,
  accountDiscoveryEnabled: false,
};

describe("integration templates", () => {
  it("account discovery never enables silent login or automatic account merging", () => {
    const prompt = buildAiPrompt({ ...app, accountDiscoveryEnabled: true }, "generic", "tanstack");
    expect(prompt).not.toContain("prompt=none");
    expect(prompt).toContain("Require an authenticated local session, explicit consent and conflict checks");
    expect(prompt).toContain("never merge solely because emails match");
  });
  it("injects client id, discovery url and scopes, never a secret", () => {
    const p = buildAiPrompt(app, "cursor", "nextjs");
    expect(p).toContain("rout_abc");
    expect(p).toContain(DISCOVERY_URL);
    expect(p).toContain("openid email");
    expect(p).toContain("rout_public_activity");
    expect(p).not.toContain("is_verified_person");
    expect(p).not.toMatch(/routsec_/);
  });
  it("embeds the official bunny SVG and brand colors in every AI prompt", () => {
    for (const p of [buildAiPrompt(app, "cursor", "nextjs"), buildHandleSyncPrompt({ name: "Demo", clientId: "rout_abc" })]) {
      expect(p).toContain("## Branding & UI");
      expect(p).toContain("<svg");
      expect(p).toContain('aria-label="ROUT"');
      expect(p).toContain("#7026E1");
      expect(p).toContain("#41DB97");
    }
  });
  it("adds identity link table only with auto-discovery", () => {
    expect(buildSqlSchema(app)).not.toContain("user_identities");
    expect(buildSqlSchema({ ...app, accountDiscoveryEnabled: true })).toContain("user_identities");
    expect(buildPrismaSchema({ ...app, accountDiscoveryEnabled: true })).toContain("model UserIdentity");
  });
  it("lists claims per granted scope only", () => {
    expect(claimsForScopes(["openid", "email"])).toEqual(["sub", "email", "email_verified"]);
    expect(claimsForScopes(["openid"])).not.toContain("picture");
    expect(buildAiPrompt(app, "generic", "other")).toContain("email_verified");
  });
  it("maps errors to fixes", () => {
    expect(hintFor("missing_code_challenge")?.fix).toContain("S256");
    expect(hintFor("invalid_grant", "PKCE-controle mislukt.")?.title).toContain("PKCE");
    expect(hintFor(null)).toBeNull();
  });
});

import { buildBadgePrompt, buildHandleSyncPrompt, emailUpdatedSample } from "./integration-templates";
import { routHandleClaim } from "./handle-sync";

describe("Universal Handle Sync", () => {
  it("shares rout_handle only when enabled and profile scope granted", () => {
    expect(routHandleClaim(true, ["openid", "profile"], "anna")).toBe("anna");
    expect(routHandleClaim(false, ["openid", "profile"], "anna")).toBeUndefined();
    expect(routHandleClaim(true, ["openid", "email"], "anna")).toBeUndefined();
  });
  it("prompts contain the real client_id and never a secret", () => {
    const app = { name: "Demo", clientId: "rout_abc123" };
    for (const p of [buildHandleSyncPrompt(app), buildBadgePrompt(app), emailUpdatedSample()]) {
      expect(p).not.toMatch(/rcs_|client_secret=/);
    }
    expect(buildHandleSyncPrompt(app)).toContain("rout_abc123");
  });
  it("never mentions a handle-change webhook, which ROUT does not send", () => {
    const app = { name: "Demo", clientId: "rout_abc123" };
    expect(buildHandleSyncPrompt(app)).not.toMatch(/user\.handle\.updated|handle[- ]change webhook/i);
  });
  it("shows the real e-mail webhook event", () =>
    expect(emailUpdatedSample()).toContain("https://schemas.rout.be/events/user-email-updated"));
});

import { CLAIMS_SUPPORTED } from "./integration-templates";
describe("Handle Sync in templates", () => {
  const base = { clientId: "rout_x", scopes: ["openid", "profile"], redirectUris: [], requirePkce: true, richIdentityEnabled: false, accountDiscoveryEnabled: false };
  it("discovery advertises rout_handle", () => {
    expect(CLAIMS_SUPPORTED).toContain("rout_handle");
    expect(CLAIMS_SUPPORTED).toContain("rout_public_activity");
  });
  it("adds username + webhook only when handle sync is on", () => {
    expect(buildAiPrompt(base, "cursor", "nextjs")).not.toContain("user.handle.updated");
    // ROUT sends no handle webhook yet, so the prompt must not ask for one.
    expect(buildAiPrompt({ ...base, handleSyncEnabled: true }, "cursor", "nextjs")).not.toContain("user.handle.updated");
    expect(buildAiPrompt({ ...base, handleSyncEnabled: true }, "cursor", "nextjs")).toContain("every login");
    expect(buildSqlSchema(base)).not.toContain("username");
    expect(buildSqlSchema({ ...base, handleSyncEnabled: true })).not.toContain("rout_webhook_events");
    expect(buildPrismaSchema({ ...base, handleSyncEnabled: true })).not.toContain("RoutWebhookEvent");
    expect(claimsForScopes(["openid", "profile"], true)).toContain("rout_handle");
    expect(claimsForScopes(["openid", "email"], true)).not.toContain("rout_handle");
  });
});

import { buildChangePrompt, promptSnapshot } from "./integration-templates";
describe("change prompts", () => {
  const base = { clientId: "rout_x", scopes: ["openid", "email"], redirectUris: ["https://x.be/cb"], requirePkce: true, richIdentityEnabled: false, accountDiscoveryEnabled: false };
  it("is null when nothing changed", () => {
    expect(buildChangePrompt(promptSnapshot(base), base, "generic", "other")).toBeNull();
  });
  it("only describes the added scope and tells the AI not to rebuild login", () => {
    const p = buildChangePrompt(promptSnapshot(base), { ...base, scopes: [...base.scopes, "accounts:merge"] }, "lovable", "tanstack")!;
    expect(p).toContain("Scope added: `accounts:merge`");
    expect(p).toContain("#rout_blind_hashes=");
    expect(p).toContain("Do NOT rebuild");
    expect(p).not.toContain("Scope removed");
  });
  it("never offers linked_accounts claims any more", () => {
    expect(CLAIMS_SUPPORTED).not.toContain("linked_accounts" as never);
    expect(buildAiPrompt({ ...base, scopes: ["openid", "linked_accounts"] }, "generic", "other")).not.toContain("linked_accounts[]");
  });
  it("the full prompt hashes with the app's own client id", () => {
    expect(buildAiPrompt({ ...base, scopes: ["openid", "accounts:merge"] }, "generic", "other")).toContain("rout-bhm-v1|rout_x|");
  });
});
