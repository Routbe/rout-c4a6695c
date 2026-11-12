import { useI18n } from "@/lib/i18n";
import { DocHelpLink } from "@/components/seo/DocHelpLink";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Cog, Plus, User, Users } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { featureForPath, scopedPath } from "@/lib/scope-routes";
import { WorkspaceIcon } from "@/components/workspace/WorkspaceIcon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getWorkspaceContext, setActiveWorkspace } from "@/lib/workspaces.functions";

export const WORKSPACE_QUERY_KEY = ["workspace-context"] as const;

export function useWorkspaceContext() {
  const fetchCtx = useServerFn(getWorkspaceContext);
  return useQuery({ queryKey: WORKSPACE_QUERY_KEY, queryFn: () => fetchCtx(), staleTime: 30_000, retry: false });
}

export type Scope =
  | { type: "personal"; userId: string | null }
  | { type: "workspace"; workspaceId: string; role: "owner" | "admin" | "member" };

/**
 * Central scope: Personal or one workspace. Switching sets the server-side
 * HttpOnly cookie, clears every cached query (no data crosses scopes) and
 * reopens the same feature under the new scope URL.
 */
export function useScope() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useWorkspaceContext();
  const setActive = useServerFn(setActiveWorkspace);
  const [busy, setBusy] = useState(false);

  const available = data?.available === true;
  const workspaceList = Array.isArray(data?.workspaces) ? data.workspaces.filter(Boolean) : [];
  const active = workspaceList.find((w) => w.id === data?.activeWorkspaceId) ?? null;
  const scope: Scope = active
    ? { type: "workspace", workspaceId: active.id, role: active.role as "owner" | "admin" | "member" }
    : { type: "personal", userId: null };

  const switchTo = async (workspaceId: string | null) => {
    if (busy) return;
    if (!available) { toast.error(t("workspace.switchError")); return; }
    if ((active?.id ?? null) === workspaceId) return;
    setBusy(true);
    try {
      await setActive({ data: { workspaceId } });
      await qc.cancelQueries();
      qc.clear();
      const slug = workspaceList.find((w) => w.id === workspaceId)?.slug ?? null;
      const target = scopedPath(slug, featureForPath(window.location.pathname));
      // Full navigation guarantees the new HttpOnly scope cookie is used by every
      // loader and server function; a same-path client navigation could look like "nothing happened".
      window.location.assign(target);
    } catch {
      toast.error(t("workspace.switchError"));
      setBusy(false);
    }
  };

  /** Opens the 5-step wizard; the workspace is created only at its last step. */
  const newWorkspace = () => {
    void navigate({ to: "/studio/workspaces/new" });
  };

  return { scope, active, workspaces: workspaceList, switchTo, newWorkspace, busy, available };
}

/** Vercel-style switcher: Personal + every workspace the user belongs to. */
export function WorkspaceSwitcher({ alwaysShow = false }: { alwaysShow?: boolean }) {
  const { t } = useI18n();
  const { active, workspaces, switchTo, newWorkspace, busy, available } = useScope();
  const navigate = useNavigate();
  const data = { workspaces };
  if (!available) return alwaysShow ? <span role="status" className="text-sm text-muted-foreground">Workspaces tijdelijk niet beschikbaar.</span> : null;

  if (!alwaysShow && !data?.workspaces.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-tour="workspace"
        disabled={busy}
        className="flex max-w-[12rem] items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
        aria-label={t("workspace.switch")}
      >
        {active ? <WorkspaceIcon avatarUrl={active.avatarUrl} icon={active.icon} category={active.category} /> : <User className="h-4 w-4 shrink-0" />}
        <span className="truncate">{active ? active.name : t("workspace.personal")}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={16} className="max-h-[70vh] w-[calc(100vw-2rem)] max-w-64 overflow-y-auto">
        <DropdownMenuItem onSelect={() => void switchTo(null)}>
          <User className="mr-2 h-4 w-4" /> {t("workspace.personal")}
          {!active && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        {data.workspaces.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t("workspace.list")}</DropdownMenuLabel>
            {data.workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onSelect={() => void switchTo(w.id)}>
                <WorkspaceIcon avatarUrl={w.avatarUrl} icon={w.icon} category={w.category} className="mr-2" />
                <span className="truncate">{w.name}</span>
                <span className="ml-auto pl-2 text-xs text-muted-foreground">{t(`workspace.role.${w.role}`)}</span>
                {w.id === active?.id && <Check className="ml-1 h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        {active && (
          <DropdownMenuItem onClick={() => void navigate({ to: "/studio/w/$workspaceSlug/settings", params: { workspaceSlug: active.slug } })}>
            <Users className="mr-2 h-4 w-4" /> Workspace-instellingen
          </DropdownMenuItem>
        )}
        <div className="flex items-center">
          <DropdownMenuItem onClick={newWorkspace} className="flex-1">
            <Plus className="mr-2 h-4 w-4" /> {t("workspace.new")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void navigate({ to: "/studio/workspaces/claim" })} aria-label="Workspace claimen" title="Workspace claimen" className="h-8 w-8 justify-center p-0">
            <Cog className="h-4 w-4" aria-hidden />
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator />
        <div className="px-2 py-2"><DocHelpLink to="/support/workspace/getting-started/what-is-a-workspace">Hoe werken bedrijfsaccounts?</DocHelpLink></div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
