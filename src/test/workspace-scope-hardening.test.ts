// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCleanSlugClaim, matrixWorkspaceSlug } from "@/lib/workspace-rules";
import { scopeStorageSummary, STORAGE_QUOTA_MESSAGE } from "@/lib/entitlement-engine";

const ROOT = join(__dirname, "..", "..");
const base = { slug: "atelier", currentSlug: "atelier-k4f9", reserved: false, brandReleased: false, taken: false };

describe("clean workspace slug after upgrade", () => {
  it("refuses a free workspace", () => {
    expect(checkCleanSlugClaim({ ...base, plan: "free" })).toMatch(/Plus of Pro/);
  });
  it("allows Plus and Pro", () => {
    expect(checkCleanSlugClaim({ ...base, plan: "plus" })).toBeNull();
    expect(checkCleanSlugClaim({ ...base, plan: "pro" })).toBeNull();
  });
  it("refuses a slug that is already taken", () => {
    expect(checkCleanSlugClaim({ ...base, plan: "pro", taken: true })).toMatch(/al in gebruik/);
  });
  it("allows a reserved brand only with an admin release", () => {
    const r = { ...base, plan: "pro", slug: "google", reserved: true };
    expect(checkCleanSlugClaim(r)).toMatch(/beschermd/);
    expect(checkCleanSlugClaim({ ...r, brandReleased: true })).toBeNull();
  });
  it("paid plans derive the slug without the 4-char suffix", () => {
    expect(matrixWorkspaceSlug("Atelier", "pro", "k4f9")).toBe("atelier");
    expect(matrixWorkspaceSlug("Atelier", "free", "k4f9")).toBe("atelier-k4f9");
  });
});

describe("storage shown for the active scope", () => {
  it("a free workspace shows 0 MB and the quota message", () => {
    const s = scopeStorageSummary({ scopeType: "workspace", basePlan: "free", verified: true, overrides: [] }, 0);
    expect(s.quotaBytes).toBe(0);
    expect(s.message).toBe(STORAGE_QUOTA_MESSAGE);
  });
  it("a Plus workspace shows its own 2048 MB, not the personal quota", () => {
    const s = scopeStorageSummary({ scopeType: "workspace", basePlan: "plus", verified: true, overrides: [] }, 0);
    expect(s.quotaBytes).toBe(2048 * 1024 * 1024);
    expect(s.blocked).toBe(false);
  });
});

describe("personal account page has no workspace team", () => {
  it("does not render TeamTab", () => {
    expect(readFileSync(join(ROOT, "src/components/imported-pages/AccountSettings.tsx"), "utf8")).not.toMatch(/TeamTab/);
  });
});

describe("database hardening migrations (snapshot)", () => {
  const snap = JSON.parse(readFileSync(join(ROOT, "db/schema.snapshot.json"), "utf8")) as {
    tables: { schema: string; name: string; rls: boolean; policies: { name: string; roles: string[] }[]; columns: { name: string }[]; constraints: unknown[] }[];
  };
  const pub = (n: string) => {
    const table = snap.tables.find((t) => t.schema === "public" && t.name === n);
    if (!table) throw new Error(`Missing table ${n}`);
    return table;
  };
  it("owner and workspace tables get a scope policy", () => {
    for (const n of ["bookings", "user_assets", "workspace_members", "profile_drafts"]) {
      expect(pub(n).policies.map((p) => p.name)).toContain("rout_scope");
    }
  });
  it("secret tables stay deny-by-default for runtime; only the non-login merge executor has a policy", () => {
    for (const n of ["api_keys", "auth_tokens", "psp_credentials", "user_sessions"]) {
      expect(pub(n).rls).toBe(true);
      expect(pub(n).policies.map((p) => p.roles)).toEqual([["rout_merge_executor"]]);
    }
  });
  it("users link to the Better Auth identity with ON DELETE CASCADE", () => {
    expect(pub("users").columns.map((c) => c.name)).toContain("auth_user_id");
    expect(JSON.stringify(pub("users").constraints)).toMatch(/users_auth_user_id_fkey[\s\S]*ON DELETE CASCADE/i);
  });
});
