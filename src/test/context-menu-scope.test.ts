// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contextBadge, contextLinks, GLOBAL_ACCOUNT_LINK } from "@/lib/context-menu";
import { scanTrend, trackedQrScopeSql } from "@/lib/dashboard-scope";

const ws = { name: "Acme", slug: "acme-9a2f", plan: "plus" };

describe("context-aware profile menu", () => {
  it("personal shows Persoonlijke Studio and Dashboard only", () => {
    expect(contextLinks({ workspace: null, personalPlan: "free" }).map((l) => l.label)).toEqual(["Persoonlijke Studio", "Dashboard"]);
    expect(contextBadge({ workspace: null, personalPlan: "pro" })).toEqual({ label: "Persoonlijk", plan: "PRO" });
  });
  it("workspace shows Workspace Studio, Dashboard and settings under the slug", () => {
    const links = contextLinks({ workspace: ws, personalPlan: "pro" });
    expect(links.map((l) => l.to)).toEqual(["/studio/w/acme-9a2f/studio", "/studio/w/acme-9a2f/dashboard", "/studio/w/acme-9a2f/settings"]);
    expect(contextBadge({ workspace: ws, personalPlan: "pro" })).toEqual({ label: "Workspace: Acme", plan: "PLUS" });
  });
  it("account & security is global and never scoped", () => {
    expect(GLOBAL_ACCOUNT_LINK.to).toBe("/studio/account");
  });
});

describe("/studio/account holds only global settings", () => {
  const src = readFileSync(join(__dirname, "..", "components", "imported-pages", "AccountSettings.tsx"), "utf8");
  it("has no team, workspace or design panels", () => {
    for (const p of ["TeamTab", "DesignTemplatesPanel", "ProfileThemePicker"]) expect(src).not.toContain(p);
  });
});

describe("dashboard statistics per scope", () => {
  it("workspace filters on workspace_id", () => {
    expect(trackedQrScopeSql({ userId: "u", workspaceId: "w" })).toEqual({ where: "t.workspace_id = $1", params: ["w"] });
  });
  it("personal excludes workspace QR codes", () => {
    expect(trackedQrScopeSql({ userId: "u", workspaceId: null }).where).toContain("workspace_id is null");
  });
  it("trend puts today's scans in the last bucket", () => {
    const now = new Date("2026-10-30T12:00:00");
    expect(scanTrend([{ day: "2026-10-30T00:00:00", n: 3 }], now)[13]).toBe(3);
  });
});
