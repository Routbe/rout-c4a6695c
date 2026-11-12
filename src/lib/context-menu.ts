/** Pure, unit-tested link set for the context-aware profile menu. Global account links never depend on scope. */
import { scopedPath } from "./scope-routes";

export type MenuLink = { key: string; label: string; to: string };
export type MenuContext = { workspace: { name: string; slug: string; plan: string } | null; personalPlan: string };

export const ACCOUNT_PATH = "/studio/account";

export function contextBadge(ctx: MenuContext): { label: string; plan: string } {
  const plan = (ctx.workspace ? ctx.workspace.plan : ctx.personalPlan || "free").toUpperCase();
  return { label: ctx.workspace ? `Workspace: ${ctx.workspace.name}` : "Persoonlijk", plan };
}

export function contextLinks(ctx: MenuContext): MenuLink[] {
  if (!ctx.workspace) {
    return [
      { key: "studio", label: "Persoonlijke Studio", to: scopedPath(null, "studio") },
      { key: "dashboard", label: "Dashboard", to: scopedPath(null, "dashboard") },
    ];
  }
  const slug = ctx.workspace.slug;
  return [
    { key: "studio", label: "Workspace Studio", to: scopedPath(slug, "studio") },
    { key: "dashboard", label: "Workspace Dashboard", to: scopedPath(slug, "dashboard") },
    { key: "settings", label: "Workspace Instellingen", to: `/studio/w/${encodeURIComponent(slug)}/settings` },
  ];
}

/** Always last, visually separated, right above sign-out. */
export const GLOBAL_ACCOUNT_LINK: MenuLink = { key: "account", label: "Account & Beveiliging", to: ACCOUNT_PATH };
