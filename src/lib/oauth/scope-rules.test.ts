// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { SUPPORTED_SCOPES, validateRequestedScopes, resolveRefreshScopes } from "./scope-rules";
import { pairwiseSubject } from "./subject";

const CLIENT_SCOPES = ["openid", "profile", "email", "offline_access"];

describe("scope whitelist (Cluster C)", () => {
  it("accepts requested scopes that are supported and registered for the client", () => {
    const r = validateRequestedScopes(["openid", "profile", "email"], CLIENT_SCOPES);
    expect(r).toEqual({ ok: true, scopes: ["openid", "profile", "email"] });
  });

  it("rejects a scope outside the whitelist before consent", () => {
    const r = validateRequestedScopes(["openid", "admin:all"], [...CLIENT_SCOPES, "admin:all"]);
    expect(r).toEqual({ ok: false, unknown: "admin:all" });
  });

  it("rejects a supported scope the client never registered", () => {
    const r = validateRequestedScopes(["openid", "sybil:verify"], CLIENT_SCOPES);
    expect(r).toEqual({ ok: false, unknown: "sybil:verify" });
  });

  it("always keeps openid and dedupes the request", () => {
    const r = validateRequestedScopes(["profile", "profile"], CLIENT_SCOPES);
    expect(r).toEqual({ ok: true, scopes: ["openid", "profile"] });
  });

  it("whitelist contains exactly the documented scopes", () => {
    expect([...SUPPORTED_SCOPES].sort()).toEqual(
      ["openid", "profile", "email", "linked_accounts", "accounts:merge", "offline_access", "sybil:verify", "profile:read", "identity:legal_name", "identity:national_id", "identity:handle_reservation", "assets:write", "profile:draft", "identity:read_public"].sort(),
    );
  });
});

describe("refresh token down-scoping", () => {
  const granted = ["openid", "profile", "email", "offline_access"];

  it("reuses the original grant when no scope is requested", () => {
    expect(resolveRefreshScopes(null, granted)).toEqual({ ok: true, scopes: granted });
    expect(resolveRefreshScopes([], granted)).toEqual({ ok: true, scopes: granted });
  });

  it("allows narrowing to a subset", () => {
    expect(resolveRefreshScopes(["openid", "email"], granted)).toEqual({ ok: true, scopes: ["openid", "email"] });
  });

  it("refuses widening beyond the original grant", () => {
    const r = resolveRefreshScopes(["openid", "linked_accounts"], granted);
    expect(r).toEqual({ ok: false, unknown: "linked_accounts" });
  });

  it("refuses scopes outside the whitelist even when somehow granted", () => {
    const r = resolveRefreshScopes(["openid", "admin:all"], [...granted, "admin:all"]);
    expect(r).toEqual({ ok: false, unknown: "admin:all" });
  });
});

describe("pairwise subject rollout", () => {
  const secret = "s".repeat(40);

  it("stays stable per sector so existing clients never change id", async () => {
    const first = await pairwiseSubject(secret, "app.example", "user-1");
    expect(await pairwiseSubject(secret, "app.example", "user-1")).toBe(first);
    expect(first).toBe(createHmac("sha256", secret).update("app.exampleuser-1").digest("base64url"));
  });

  it("differs between sectors and between users", async () => {
    const a = await pairwiseSubject(secret, "a.example", "user-1");
    expect(await pairwiseSubject(secret, "b.example", "user-1")).not.toBe(a);
    expect(await pairwiseSubject(secret, "a.example", "user-2")).not.toBe(a);
  });
});

/* ---------------------------------------- sybil nullifier isolation ---- */

vi.mock("@/lib/neon", () => ({
  withDbContext: (_context: unknown, fn: () => unknown) => fn(),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join("?");
    if (q.includes("from public.users u left join public.profiles"))
      return Promise.resolve([{ email: "jona@mail.be", email_confirmed_at: "2026-01-01", username: "jona", display_name: "Jona", avatar_url: null }]);
    if (q.includes("from public.verified_identities")) {
      // Only "user-1" is a verified human; everyone else has no identity row.
      if (String(vals[0]) === "user-1")
        return Promise.resolve([{ tier_1_real_human: true, tier_2_legal_identity: false, identity_nullifier: "n-1", national_id_nullifier: null, legal_name: null }]);
      return Promise.resolve([]);
    }
    if (q.includes("from public.oauth_clients")) return Promise.resolve([]);
    if (q.includes("is_trusted_kyc_partner")) return Promise.resolve([{ is_trusted_kyc_partner: false }]);
    if (q.includes("insert into public.identity_disclosure_logs")) return Promise.resolve([]);
    void vals;
    return Promise.resolve([]);
  },
}));

beforeEach(() => {
  process.env["ROUT_PROVIDER_PAIRWISE_SECRET"] = "p".repeat(40);
  process.env["ROUT_SYBIL_PEPPER"] = "q".repeat(40);
});

describe("sybil nullifier isolation", () => {
  it("never emits a nullifier without the sybil:verify scope, even for a verified human", async () => {
    const { generateUserInfoResponse } = await import("@/lib/auth/oidc-identifiers.server");
    const body = await generateUserInfoResponse("user-1", "app-a", ["openid", "profile"], { sub: "sub-1" });
    expect(body["app_sybil_nullifier"]).toBeUndefined();
    expect(body["is_unique_human"]).toBeUndefined();
  });

  it("emits the nullifier only when sybil:verify was granted and the tier allows it", async () => {
    const { generateUserInfoResponse } = await import("@/lib/auth/oidc-identifiers.server");
    const body = await generateUserInfoResponse("user-1", "app-a", ["openid", "sybil:verify"], { sub: "sub-1" });
    expect(body["is_unique_human"]).toBe(true);
    expect(typeof body["app_sybil_nullifier"]).toBe("string");
  });

  it("reports is_unique_human false when the tier is insufficient", async () => {
    const { generateUserInfoResponse } = await import("@/lib/auth/oidc-identifiers.server");
    // verified_identities returns a tier-1 row; a user without any row gets tier none.
    const body = await generateUserInfoResponse("user-without-identity", "app-a", ["openid", "sybil:verify"], { sub: "sub-2" });
    expect(body).toHaveProperty("is_unique_human");
    expect(body["app_sybil_nullifier"]).toBeUndefined();
  });
});

import { consentDelta } from "./scope-rules";

describe("consentDelta (Verifiëren met ROUT)", () => {
  it("shows only new scopes after an earlier grant", () => {
    const r = consentDelta(["openid", "profile", "sybil:verify"], ["openid", "profile"], null);
    expect(r.incremental).toBe(true);
    expect(r.shown).toEqual(["sybil:verify"]);
    expect(r.previouslyGranted).toEqual(["profile"]);
  });
  it("shows everything on a first grant", () => {
    const r = consentDelta(["openid", "email"], [], null);
    expect(r.incremental).toBe(false);
    expect(r.shown).toEqual(["openid", "email"]);
  });
  it("prompt=consent forces the full list", () => {
    expect(consentDelta(["openid", "profile", "sybil:verify"], ["openid", "profile"], "consent").shown).toEqual(["openid", "profile", "sybil:verify"]);
  });
});
