import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyConsentToggles, nationalIdDecision, splitLegalName } from "./scope-rules";
import { planBulkEmailUpdate, signWebhook, webhookUrlAllowed, emailUpdatedEvent } from "./backchannel";
import { mapRecentTracks, parseLastfmUser } from "@/lib/integrations/lastfm";
import { createHmac } from "node:crypto";

// Database mocked: two apps, per-app email assignments, one tier-2 identity.
const db = {
  assignments: new Map<string, { source: string; alias_id: string | null; assigned_email: string }>(),
  trusted: new Set<string>(),
  logs: [] as unknown[][],
  logFailure: false,
};
vi.mock("@/lib/neon", () => ({
  withDbContext: (_context: unknown, fn: () => unknown) => fn(),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join("?");
    if (q.includes("from public.users u left join public.profiles"))
      return Promise.resolve([{ email: "jona@mail.be", email_confirmed_at: "2026-01-01", username: "jona", display_name: "Jona", avatar_url: null }]);
    if (q.includes("from public.users where id")) return Promise.resolve([{ email: "jona@mail.be", email_confirmed_at: "2026-01-01" }]);
    if (q.includes("from public.email_aliases")) return Promise.resolve([{ id: "a1", alias: "contact@rout.be", status: "active" }]);
    if (q.includes("from public.oauth_email_forwarding_rules")) return Promise.resolve([]);
    if (q.includes("insert into public.app_email_assignments")) {
      if (!db.assignments.has(String(vals[1]))) db.assignments.set(String(vals[1]), { source: "primary", alias_id: null, assigned_email: String(vals[2]) });
      return Promise.resolve([]);
    }
    if (q.includes("from public.app_email_assignments a")) {
      const r = db.assignments.get(String(vals[1]));
      return Promise.resolve(r ? [r] : []);
    }
    if (q.includes("is_trusted_kyc_partner")) return Promise.resolve([{ is_trusted_kyc_partner: db.trusted.has(String(vals[0])) }]);
    if (q.includes("from public.oauth_clients")) return Promise.resolve([]);
    if (q.includes("from public.verified_identities"))
      return Promise.resolve([{ tier_1_real_human: true, tier_2_legal_identity: true, identity_nullifier: "n-1", national_id_nullifier: "nat-1", legal_name: "Jona Zeno Delplanche" }]);
    if (q.includes("insert into public.identity_disclosure_logs")) {
      if (db.logFailure) return Promise.reject(new Error("audit_unavailable"));
      db.logs.push(vals); return Promise.resolve([]);
    }
    return Promise.resolve([]);
  },
}));

beforeEach(() => {
  db.assignments.clear();
  db.trusted.clear();
  db.logs = [];
  db.logFailure = false;
  process.env["ROUT_PROVIDER_PAIRWISE_SECRET"] = "p".repeat(40);
  process.env["ROUT_SYBIL_PEPPER"] = "q".repeat(40);
});

describe("identifier layers", () => {
  it("App A and App B get different pairwise subjects for the same user", async () => {
    // Subjects come from the HKDF vault (see subject-vault.test.ts for the full rules).
    const { scopedSubject } = await import("./subject-vault");
    const uid = "123e4567-e89b-12d3-a456-426614174000";
    const a = await scopedSubject("m".repeat(64), 2, "client:app-a", uid);
    const b = await scopedSubject("m".repeat(64), 2, "client:app-b", uid);
    expect(a).not.toBe(b);
    expect(a).not.toContain(uid);
    expect(await scopedSubject("m".repeat(64), 2, "client:app-a", uid)).toBe(a);
  });
  it("sybil nullifier is stable within App A and differs from App B", async () => {
    const { getAppSybilNullifier } = await import("@/lib/auth/oidc-identifiers.server");
    const a1 = await getAppSybilNullifier("user-1", "app-a");
    expect(await getAppSybilNullifier("user-1", "app-a")).toBe(a1);
    expect(await getAppSybilNullifier("user-1", "app-b")).not.toBe(a1);
  });
});

describe("national_id rules", () => {
  it("is 403 unless trusted partner + tier 2 + step-up", () => {
    expect(nationalIdDecision({ trustedPartner: false, tier: "tier_2", stepUp: true })).toMatchObject({ ok: false, status: 403 });
    expect(nationalIdDecision({ trustedPartner: true, tier: "tier_1", stepUp: true })).toMatchObject({ ok: false, status: 403 });
    expect(nationalIdDecision({ trustedPartner: true, tier: "tier_2", stepUp: false })).toMatchObject({ ok: false, status: 403 });
    expect(nationalIdDecision({ trustedPartner: true, tier: "tier_2", stepUp: true })).toEqual({ ok: true });
  });
  it("userinfo answers 403 for an untrusted app and works for a trusted one after step-up", async () => {
    const { generateUserInfoResponse, ScopeForbiddenError } = await import("@/lib/auth/oidc-identifiers.server");
    await expect(generateUserInfoResponse("user-1", "app-a", ["openid", "identity:national_id"], { sub: "s", acr: "urn:rout:acr:strict" }))
      .rejects.toBeInstanceOf(ScopeForbiddenError);
    db.trusted.add("app-a");
    await expect(generateUserInfoResponse("user-1", "app-a", ["openid", "identity:national_id"], { sub: "s", acr: null }))
      .rejects.toBeInstanceOf(ScopeForbiddenError);
    const ok = await generateUserInfoResponse("user-1", "app-a", ["openid", "identity:national_id"], { sub: "s", acr: "urn:rout:acr:strict" });
    expect(ok["sub"]).toBe("s");
  });
});

describe("userinfo email per app", () => {
  it("keeps an app's previous primary until explicitly updated", async () => {
    const { generateUserInfoResponse } = await import("@/lib/auth/oidc-identifiers.server");
    db.assignments.set("app-a", { source: "primary", alias_id: null, assigned_email: "previous@mail.be" });
    const result = await generateUserInfoResponse("user-1", "app-a", ["openid", "email"], { sub: "sa" });
    expect(result["email"]).toBe("previous@mail.be");
    expect(result["email_verified"]).toBe(false);
  });
  it("omits email rather than exposing primary when a selected alias is unavailable", async () => {
    const { generateUserInfoResponse } = await import("@/lib/auth/oidc-identifiers.server");
    db.assignments.set("app-a", { source: "alias", alias_id: "removed", assigned_email: "hidden@rout.be" });
    const result = await generateUserInfoResponse("user-1", "app-a", ["openid", "email"], { sub: "sa" });
    expect(result).not.toHaveProperty("email");
  });
  it("rejects an explicit email choice outside the member's options", async () => {
    const { assignAppEmail } = await import("./email-broker.server");
    await expect(assignAppEmail("user-1", "app-a", "someone-else")).rejects.toThrow("email_choice_unavailable");
    expect(db.assignments.size).toBe(0);
  });
  it("refuses sensitive disclosure when its audit record cannot be saved", async () => {
    db.logFailure = true;
    const { generateUserInfoResponse } = await import("@/lib/auth/oidc-identifiers.server");
    await expect(generateUserInfoResponse("user-1", "app-a", ["openid", "identity:legal_name"], { sub: "s" })).rejects.toThrow("audit_unavailable");
  });
  it("returns the app's assigned email, and saves the primary as initial assignment", async () => {
    const { generateUserInfoResponse } = await import("@/lib/auth/oidc-identifiers.server");
    db.assignments.set("app-b", { source: "alias", alias_id: "a1", assigned_email: "contact@rout.be" });
    const a = await generateUserInfoResponse("user-1", "app-a", ["openid", "email"], { sub: "sa" });
    const b = await generateUserInfoResponse("user-1", "app-b", ["openid", "email"], { sub: "sb" });
    expect(a["email"]).toBe("jona@mail.be");
    expect(b["email"]).toBe("contact@rout.be");
    expect(db.assignments.get("app-a")?.assigned_email).toBe("jona@mail.be");
  });
  it("logs sensitive disclosures and splits the legal name", async () => {
    const { generateUserInfoResponse } = await import("@/lib/auth/oidc-identifiers.server");
    const r = await generateUserInfoResponse("user-1", "app-a", ["openid", "identity:legal_name", "sybil:verify"], { sub: "s" });
    expect(r["last_name"]).toBe("Delplanche");
    expect(r["is_unique_human"]).toBe(true);
    expect(db.logs).toHaveLength(1);
    expect(splitLegalName("Jona Zeno Delplanche").first_name).toBe("Jona Zeno");
  });
});

describe("consent toggles", () => {
  it("drops declined optional scopes but never openid", () => {
    expect(applyConsentToggles(["openid", "email", "identity:legal_name"], ["identity:legal_name", "openid"])).toEqual(["openid", "email"]);
  });
});

describe("bulk email wizard", () => {
  const rows = [
    { clientId: "a", source: "primary", assignedEmail: "old@mail.be" },
    { clientId: "b", source: "alias", assignedEmail: "contact@rout.be" },
    { clientId: "c", source: "relay", assignedEmail: "priv-1@mail.rout.be" },
    { clientId: "d", source: "primary", assignedEmail: "old@mail.be" },
  ];
  it("updates every selected app except relays", () => {
    const plan = planBulkEmailUpdate(rows, ["a", "b", "c", "d"], "new@mail.be");
    expect(plan.map((p) => p.clientId)).toEqual(["a", "b", "d"]);
    expect(plan.every((p) => p.newEmail === "new@mail.be")).toBe(true);
  });
  it("leaves unselected apps alone", () => {
    expect(planBulkEmailUpdate(rows, ["a"], "new@mail.be").map((p) => p.clientId)).toEqual(["a"]);
  });
});

describe("back-channel webhook", () => {
  it("signs t.body with HMAC-SHA256", async () => {
    const body = JSON.stringify(emailUpdatedEvent("sub-1", "old@x.be", "new@x.be", 1793400000));
    const sig = await signWebhook("whsec_test", body, 1793400000);
    expect(sig).toBe(`t=1793400000,v1=${createHmac("sha256", "whsec_test").update(`1793400000.${body}`).digest("hex")}`);
  });
  it("accepts only public https URLs", () => {
    expect(webhookUrlAllowed("https://app.example.com/hook")).toBe(true);
    for (const u of ["http://app.example.com", "https://localhost/x", "https://127.0.0.1/", "https://10.0.0.5/", "https://192.168.1.1/", "https://169.254.169.254/", "https://[::1]/", "https://2130706433/", "https://u:p@app.example.com/"])
      expect(webhookUrlAllowed(u)).toBe(false);
  });
});

describe("last.fm relay", () => {
  it("only a nowplaying track is live", () => {
    expect(mapRecentTracks({ recenttracks: { track: [{ name: "Song", artist: { "#text": "Band" }, "@attr": { nowplaying: "true" }, url: "https://www.last.fm/music/x" }] } }))
      .toMatchObject({ playing: true, track: "Song", artist: "Band" });
    expect(mapRecentTracks({ recenttracks: { track: [{ name: "Old" }] } }).playing).toBe(false);
  });
  it("reads a user from a link or bare name", () => {
    expect(parseLastfmUser("https://last.fm/user/jona")).toBe("jona");
    expect(parseLastfmUser("jona")).toBe("jona");
    expect(parseLastfmUser("not a user!")).toBeNull();
  });
});
