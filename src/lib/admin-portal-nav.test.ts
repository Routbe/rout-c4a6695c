import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV_GROUPS } from "@/components/admin/AdminPortalNav";
import { ADMIN_CONSOLE_TABS } from "@/components/imported-pages/Admin";

const routesDir = path.resolve(__dirname, "../routes/_authenticated");

describe("admin portal navigation", () => {
  it("links every admin page from the portal menu", () => {
    const pages = readdirSync(routesDir)
      .filter((f) => /^admin\.[a-z-]+\.tsx$/.test(f))
      .map((f) => f.replace(/^admin\./, "").replace(/\.tsx$/, ""))
      .map((name) => (name === "index" ? "/admin" : `/admin/${name}`));
    const linked = new Set(ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to)));
    expect(pages.filter((p) => !linked.has(p as never))).toEqual([]);
  });

  it("links every tab of the classic console", () => {
    const tabs = new Set(ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.tab)).filter(Boolean));
    expect(ADMIN_CONSOLE_TABS.filter((t) => !tabs.has(t))).toEqual([]);
  });
});
