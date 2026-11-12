import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  LogOut,
  Settings,
  ChevronDown,
  Sparkles,
  PanelsTopLeft,
} from "lucide-react";
import {
  DropdownMenu,
  SpatialDropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRouterState } from "@tanstack/react-router";
import { Link, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import { clearAdminRoleCache } from "@/hooks/useIsAdmin";
import { UserAvatar } from "@/components/UserAvatar";
import { mastodonAvatarSrc } from "@/lib/mastodon-avatar";
import { profileImageSrc } from "@/lib/image-proxy-rules";
import { useScope, useWorkspaceContext } from "@/components/WorkspaceSwitcher";
import { WorkspaceIcon } from "@/components/workspace/WorkspaceIcon";
import { Shield, CreditCard, ArrowLeft, ArrowLeftRight, Check as CheckIcon, Plus as PlusIcon, User as UserIcon, Cog as CogIcon } from "lucide-react";
import { canUseDeveloperTools } from "@/lib/workspace-rules";
import { getMyAccount } from "@/lib/account.functions";
import { contextBadge, contextLinks, GLOBAL_ACCOUNT_LINK } from "@/lib/context-menu";
import { HeaderControl } from "@/components/layout/HeaderControls";
import { spatialHaptic } from "@/lib/spatial-haptics";

/**
 * Account context only. Platform tools live in the burger menu so the two
 * surfaces never duplicate each other.
 */
import { i18n as trI18n } from "@/lib/i18n";
export function ProfileMenu() {
  const { data: wsCtx } = useWorkspaceContext();
  const devTools = canUseDeveloperTools(wsCtx?.activeRole ?? null);
  const scopeApi = useScope();
  const { user, signOut, loading } = useAuth();

  const nav = useNavigate();
  const [fullName, setFullName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [tier, setTier] = useState<string>("free");
  const [verified, setVerified] = useState(false);
  const [earlyBeliever, setEarlyBeliever] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const reducedMotion = useReducedMotion();
  const loadAccount = useServerFn(getMyAccount);

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setFullName(null);
      setUsername(null);
      setTier("free");
      setVerified(false);
      setEarlyBeliever(false);
      setAvatarUrl(null);
      return;
    }
    (async () => {
      const data = await loadAccount();
      if (cancelled || !data) return;
      setFullName(data.displayName ?? null);
      setUsername(data.username ?? null);
      setTier(data.tier ?? "free");
      setVerified(Boolean(data.verified));
      setEarlyBeliever(Boolean(data.isEarlyBeliever || data.isPaid));
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const fromProvider = meta["avatar_url"] ?? meta["picture"];
      const mastodon = meta["provider_kind"] === "mastodon" ? mastodonAvatarSrc(typeof meta["fediverse_handle"] === "string" ? meta["fediverse_handle"] : null) : null;
      setAvatarUrl(profileImageSrc(data.avatarUrl) ?? mastodon ?? profileImageSrc(typeof fromProvider === "string" ? fromProvider : null));
    })().catch(() => {
      if (!cancelled) {
        setFullName(null); setUsername(null); setAvatarUrl(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, loadAccount]);

  // Until INITIAL_SESSION resolved we must not claim "logged out" — that flicker
  // is exactly what an OAuth return looks like right before the hash is read.
  if (loading) {
    return (
      <div
        role="status"
        aria-label={trI18n.t("menu.checkingSession")}
        aria-busy="true"
        className="flex h-9 items-center gap-2 rounded-xl border border-border pl-1 pr-2"
      >
        <span className="h-7 w-7 animate-pulse rounded-lg bg-muted" />
        <span className="hidden h-3 w-20 animate-pulse rounded bg-muted sm:inline-block" />
      </div>
    );
  }

  if (!user) {
    // On the auth portal itself the header CTAs are redundant noise.
    if (pathname.startsWith("/auth") || pathname.startsWith("/login")) return null;
    return (
      <HeaderControl name="account"><Button asChild size="sm" variant="ghost">
        <Link to="/auth/sign-in">{trI18n.t("nav.signIn")}</Link>
      </Button></HeaderControl>
    );
  }

  const name = fullName || user.user_metadata?.full_name || user.email?.split("@")[0] || "Account";
  const displayName = String(name).charAt(0).toUpperCase() + String(name).slice(1);
  const handle = username || user.email?.split("@")[0] || "you";
  const tierLabel = earlyBeliever ? "Early Believer" : verified || tier === "pro" ? "Pro" : "Free";
  const isPaidTier = tierLabel !== "Free";
  const activeWs = scopeApi.active;
  const menuCtx = {
    workspace: activeWs ? { name: activeWs.name, slug: activeWs.slug, plan: activeWs.plan } : null,
    personalPlan: verified || tier === "pro" ? "pro" : "free",
  };
  const badge = contextBadge(menuCtx);
  const links = contextLinks(menuCtx);

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <HeaderControl name="account"><DropdownMenu open={menuOpen} onOpenChange={(open) => { setMenuOpen(open); if (!open) setWorkspaceView(false); spatialHaptic(); }}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost"
            type="button"
            aria-label={trI18n.t("menu.account")}
            title={displayName}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0"
          >
            <UserAvatar
              src={avatarUrl}
              name={fullName || username || user.email || "Account"}
              className="h-7 w-7"
              textClassName="text-[11px]"
              rounded="rounded-lg"
            />
          </Button>
        </DropdownMenuTrigger>

        <SpatialDropdownMenuContent open={menuOpen} align="end" collisionPadding={16} className="max-h-[70vh] w-[calc(100vw-2rem)] max-w-72 overflow-x-hidden overflow-y-auto"
          onTouchStart={(event) => { const touch = event.touches[0]; if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }; }}
          onTouchEnd={(event) => { const touch = event.changedTouches[0]; const start = touchStart.current; touchStart.current = null; if (!touch || !start) return; const dx = touch.clientX - start.x; if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(touch.clientY - start.y) * 1.5) setWorkspaceView(dx < 0); }}>
          <motion.div key={workspaceView ? "workspaces" : "account"} initial={reducedMotion ? false : { x: workspaceView ? 24 : -24, opacity: 0.7 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.18 }}>
          <div className="flex items-center gap-2 px-2 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <span
                className={
                  "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase " +
                  (isPaidTier ? "bg-foreground text-background" : "bg-muted text-muted-foreground")
                }
              >
                {tierLabel}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
            <Link
              to="/wallet"
              onClick={() => setMenuOpen(false)}
              aria-label={trI18n.t("walletPage.openMenu")}
              title={trI18n.t("walletPage.openMenu")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CreditCard className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <DropdownMenuItem className="min-h-11 gap-2" disabled={scopeApi.busy} aria-label={workspaceView ? trI18n.t("menu.backToAccount") : trI18n.t("workspace.switch")} onSelect={(event) => { event.preventDefault(); setWorkspaceView(!workspaceView); }}>
              {workspaceView && <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />}
              {scopeApi.active ? <WorkspaceIcon avatarUrl={scopeApi.active.avatarUrl} icon={scopeApi.active.icon} category={scopeApi.active.category} /> : <UserIcon className="h-4 w-4 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{scopeApi.active ? scopeApi.active.name : trI18n.t("workspace.personal")}</span>
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </DropdownMenuItem>
          {workspaceView ? <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={scopeApi.busy} onSelect={() => void scopeApi.switchTo(null)} className="min-h-11 gap-2">
                <UserIcon className="h-4 w-4" aria-hidden /> {trI18n.t("workspace.personal")}
                {!scopeApi.active && <CheckIcon className="ml-auto h-4 w-4" aria-hidden />}
              </DropdownMenuItem>
              {scopeApi.workspaces.map((w) => (
                <DropdownMenuItem key={w.id} disabled={scopeApi.busy} onSelect={() => void scopeApi.switchTo(w.id)} className="min-h-11 gap-2">
                  <WorkspaceIcon avatarUrl={w.avatarUrl} icon={w.icon} category={w.category} />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  {w.id === scopeApi.active?.id && <CheckIcon className="ml-auto h-4 w-4" aria-hidden />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="flex items-center">
                <DropdownMenuItem onClick={scopeApi.newWorkspace} className="flex-1 gap-2">
                  <PlusIcon className="h-4 w-4" aria-hidden /> {trI18n.t("workspace.new")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav("/studio/workspaces/claim")} aria-label="Workspace claimen" title="Workspace claimen" className="h-9 w-9 justify-center p-0">
                  <CogIcon className="h-4 w-4" aria-hidden />
                </DropdownMenuItem>
              </div>
          </> : <>
          <DropdownMenuSeparator />
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
            <span className="truncate font-medium">{badge.label}</span>
            <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">{badge.plan}</span>
          </div>
          {links.map((l) => (
            <DropdownMenuItem key={l.key} onClick={() => nav(l.to)} className="gap-2">
              {l.key === "studio" ? <Sparkles className="h-4 w-4 shrink-0" aria-hidden /> : l.key === "dashboard" ? <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden /> : <Settings className="h-4 w-4 shrink-0" aria-hidden />}
              {l.label}
            </DropdownMenuItem>
          ))}
          {devTools && (
            <DropdownMenuItem asChild>
              <a href="/console" target="_blank" rel="noopener noreferrer" className="gap-2">
                <PanelsTopLeft className="h-4 w-4 shrink-0" aria-hidden /> Developer Console
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => nav(GLOBAL_ACCOUNT_LINK.to)} className="gap-2">
            <Shield className="h-4 w-4 shrink-0" aria-hidden /> {GLOBAL_ACCOUNT_LINK.label}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-destructive"
            onClick={async () => {
              clearAdminRoleCache();
              await signOut();
              nav("/", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden /> Uitloggen
          </DropdownMenuItem>
          </>}
          </motion.div>
        </SpatialDropdownMenuContent>
      </DropdownMenu></HeaderControl>
    </div>
  );
}
