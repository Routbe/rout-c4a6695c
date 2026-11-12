// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { listMigrationFiles, planMigrations } from "../../scripts/migration-plan";
import { checkCleanSlugClaim, checkRootSlugClaim, checkWorkspaceDelete, checkWorkspaceRename, planAllowsCleanSlug } from "@/lib/workspace-rules";
import { contextLinks, GLOBAL_ACCOUNT_LINK } from "@/lib/context-menu";

const ROOT = join(__dirname, "..", "..");
const DB_DIR = join(ROOT, "db");

describe("db/0122 slug suffix trigger (PGlite)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto, btree_gist } });
    for (const step of planMigrations(listMigrationFiles(DB_DIR), new Set())) {
      if (step.action === "run") await db.exec(`begin;\n${readFileSync(join(DB_DIR, step.file), "utf8")}\n;commit;`);
    }
  }, 240_000);
  const slugOf = async (name: string, slug: string, plan: string) =>
    (await db.query<{ slug: string }>(
      "insert into public.workspaces (id, name, slug, plan, created_at) values (gen_random_uuid(), $1, $2, $3, now()) returning slug",
      [name, slug, plan],
    )).rows[0]!.slug;

  it("appends a 4-char suffix to a free workspace without one", async () => {
    expect(await slugOf("Acme", "acme", "free")).toMatch(/^acme-[a-z0-9]{4}$/);
  });
  it("keeps an existing suffix on free", async () => {
    expect(await slugOf("Beta", "beta-k4f9", "free")).toBe("beta-k4f9");
  });
  it("allows a clean slug on pro and business and plus", async () => {
    expect(await slugOf("Gamma", "gamma", "plus")).toBe("gamma");
    expect(await slugOf("Delta", "delta", "pro")).toBe("delta");
    expect(await slugOf("Eps", "epsilon", "business")).toBe("epsilon");
  });
  it("a downgrade to free re-adds the suffix", async () => {
    await slugOf("Zeta", "zeta", "pro");
    const r = await db.query<{ slug: string }>("update public.workspaces set plan = 'free' where slug = 'zeta' returning slug");
    expect(r.rows[0]!.slug).toMatch(/^zeta-[a-z0-9]{4}$/);
  });
  it("refuses a root alias for a free workspace", async () => {
    const id = (await db.query<{ id: string }>("select id from public.workspaces where slug = 'beta-k4f9'")).rows[0]!.id;
    await expect(db.query("insert into public.workspace_root_aliases (handle, workspace_id) values ('beta', $1)", [id])).rejects.toThrow(/requires_plan/);
  });
  it("accepts a root alias for a pro workspace and resolves it publicly", async () => {
    const id = (await db.query<{ id: string }>("select id from public.workspaces where slug = 'delta'")).rows[0]!.id;
    await db.query("insert into public.workspace_root_aliases (handle, workspace_id) values ('delta', $1)", [id]);
    const r = await db.query<{ s: string }>("select public.workspace_slug_for_root_alias('delta') as s");
    expect(r.rows[0]!.s).toBe("delta");
  });
});

describe("Early Verified counts as a paid plan for slugs", () => {
  it("free + Early Verified may drop the suffix", () => {
    expect(planAllowsCleanSlug("free")).toBe(false);
    expect(planAllowsCleanSlug("free", { earlyVerified: true })).toBe(true);
    expect(checkCleanSlugClaim({ plan: "free", earlyVerified: true, slug: "atelier", currentSlug: "atelier-k4f9", reserved: false, brandReleased: false, taken: false })).toBeNull();
  });
});

describe("root workspace slug rules", () => {
  const base = { plan: "pro", slug: "acme", reserved: false, brandReleased: false, takenByHandle: false, systemRoute: false };
  it("allows Pro and Early Verified, refuses plain free", () => {
    expect(checkRootSlugClaim(base)).toBeNull();
    expect(checkRootSlugClaim({ ...base, plan: "free", earlyVerified: true })).toBeNull();
    expect(checkRootSlugClaim({ ...base, plan: "free" })).toMatch(/Plus of Pro/);
  });
  it("refuses a name held by a personal handle", () => {
    expect(checkRootSlugClaim({ ...base, takenByHandle: true })).toMatch(/al in gebruik/);
  });
  it("refuses system routes and protected brands", () => {
    expect(checkRootSlugClaim({ ...base, slug: "studio", systemRoute: true })).toMatch(/gereserveerd/);
    expect(checkRootSlugClaim({ ...base, slug: "google", reserved: true })).toMatch(/beschermd/);
  });
});

describe("workspace rename and delete", () => {
  it("rename is owner/admin only", () => {
    expect(checkWorkspaceRename("editor", "Nieuw")).toMatch(/Alleen/);
    expect(checkWorkspaceRename("admin", "Nieuw")).toBeNull();
    expect(checkWorkspaceRename("owner", "  ")).toMatch(/1 tot 80/);
  });
  it("delete is owner only and needs the exact name", () => {
    expect(checkWorkspaceDelete("admin", "Acme", "Acme")).toMatch(/eigenaar/);
    expect(checkWorkspaceDelete("owner", "Acme", "acme")).toMatch(/exacte naam/);
    expect(checkWorkspaceDelete("owner", "Acme", "Acme")).toBeNull();
  });
});

describe("menu labels per context", () => {
  it("workspace links use explicit Workspace labels", () => {
    expect(contextLinks({ workspace: { name: "Acme", slug: "acme", plan: "pro" }, personalPlan: "free" }).map((l) => l.label))
      .toEqual(["Workspace Studio", "Workspace Dashboard", "Workspace Instellingen"]);
    expect(GLOBAL_ACCOUNT_LINK.label).toBe("Account & Beveiliging");
  });
  it("account and workspace settings never contain profile design or content tabs", () => {
    for (const f of ["src/components/imported-pages/AccountSettings.tsx", "src/routes/_authenticated/studio_.w.$workspaceSlug.settings.tsx"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const p of ["Vormgeving", "Inhoud", "DesignTemplatesPanel", "ProfileThemePicker"]) expect(src).not.toContain(p);
    }
  });
});
