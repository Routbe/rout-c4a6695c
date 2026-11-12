import { useI18n } from "@/lib/i18n";
import { ConsoleTour } from "@/components/console/ConsoleTour";
import { useState } from "react";
import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Blocks,
  Database,
  Terminal,
  Bot,
  Gauge,
  Network,
  KeyRound,
  LayoutGrid,
  Link2,
  ListChecks,
  Menu,
  Palette,
  ReceiptText,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Webhook,
  BookOpen,
} from "lucide-react";
import { RoutLogo } from "@/components/RoutLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ProfileMenu } from "@/components/ProfileMenu";
import { WorkspaceSwitcher, useWorkspaceContext } from "@/components/WorkspaceSwitcher";
import { canUseDeveloperTools } from "@/lib/workspace-rules";
import { Footer } from "@/components/Footer";
import { AppLogo } from "@/components/console/AppLogo";
import { useConsoleApp } from "@/components/console/console-data";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const GLOBAL_NAV = [
  { to: "/console", label: "Dashboard", icon: LayoutGrid, exact: true },
  { to: "/console/apps", label: "Auth & Identity", icon: Blocks, exact: false },
  { to: "/console/api", label: "API & Webhooks", icon: Webhook, exact: false },
  { to: "/console/connectors", label: "AI Connectors (MCP)", icon: Bot, exact: false },
  { to: "/console/billing", label: "Billing", icon: ReceiptText, exact: false },
  { to: "/developers", label: "Documentatie", icon: BookOpen, exact: false },
] as const;

const APP_NAV = [
  { to: "/console/apps/$appId/overview", label: "Dashboard", icon: Gauge },
  { to: "/console/apps/$appId/credentials", label: "Credentials", icon: KeyRound },
  { to: "/console/apps/$appId/branding", label: "Branding", icon: Palette },
  { to: "/console/apps/$appId/redirects", label: "Redirects", icon: Link2 },
  { to: "/console/apps/$appId/scopes", label: "Scopes", icon: ListChecks },
  { to: "/console/apps/$appId/publishing", label: "Publishing", icon: Rocket },
  { to: "/console/apps/$appId/security", label: "Security", icon: ShieldCheck },
  { to: "/console/apps/$appId/auth-logs", label: "Auth logs", icon: Terminal },
  { to: "/console/apps/$appId/ai-prompts", label: "AI Prompts", icon: Bot },
  { to: "/console/apps/$appId/schema", label: "Schema", icon: Database },
  { to: "/console/apps/$appId/architecture", label: "Architecture", icon: Network },
  { to: "/console/apps/$appId/advanced", label: "Advanced", icon: SlidersHorizontal },
] as const;

export const Route = createFileRoute("/_authenticated/console")({
  head: () => ({ meta: [{ title: 'ROUT — Developer console' }, { name: "description", content: 'Manage ROUT applications and integrations.' }, { property: "og:title", content: 'ROUT — Developer console' }, { property: "og:description", content: 'Manage ROUT applications and integrations.' }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), 
  component: ConsoleWorkspace,
});

const itemClass =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
const activeClass = { className: "bg-muted text-foreground" };

function AppSidebar({ appId, onNavigate }: { appId: string; onNavigate?: () => void }) {
  const { app } = useConsoleApp(appId);
  return (
    <>
      <Link to="/console/apps" onClick={onNavigate} className="mb-5 flex items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to all apps
      </Link>
      {app && (
        <div className="mb-4 flex items-center gap-2.5 px-3">
          <AppLogo app={app} size="sm" />
          <span className="truncate text-sm font-medium">{app.name}</span>
        </div>
      )}
      <nav className="space-y-0.5">
        {APP_NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} params={{ appId }} onClick={onNavigate} className={itemClass} activeProps={activeClass}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function GlobalSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5">
      {GLOBAL_NAV.map(({ to, label, icon: Icon, exact }) => (
        <Link key={to} to={to} data-tour={to === "/developers" ? "docs" : to === "/console/apps" ? "apps" : to === "/console/api" ? "api" : undefined} onClick={onNavigate} activeOptions={{ exact }} className={itemClass} activeProps={activeClass}>
          <Icon className="h-4 w-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const params = useParams({ strict: false }) as { appId?: string };
  return (
    <div className="flex h-full flex-col">
      <Link to="/console" onClick={onNavigate} className="mb-6 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
        Developer Console
      </Link>
      <div className="flex-1">
        {params.appId ? <AppSidebar appId={params.appId} onNavigate={onNavigate} /> : <GlobalSidebar onNavigate={onNavigate} />}
      </div>
      <a href="/dashboard" className="mt-6 flex items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to ROUT
      </a>
    </div>
  );
}

function ConsoleWorkspace() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { data: ws } = useWorkspaceContext();
  const allowed = canUseDeveloperTools(ws?.activeRole ?? null);
  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/90 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4">
          <button type="button" aria-label="Console menu" onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-muted md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <a href="/" aria-label="ROUT home" className="shrink-0">
            <RoutLogo size={28} />
          </a>
          <span className="hidden border-l border-border pl-3 text-sm text-muted-foreground sm:inline">Developer Console</span>
          <WorkspaceSwitcher alwaysShow />
          <div className="ml-auto flex items-center gap-2">
            {allowed && <ConsoleTour />}
            <Link to="/studio/account" data-tour="settings" className="rounded-md p-1.5 hover:bg-muted" aria-label={t("consoleTour.settings.title")}><SlidersHorizontal className="h-4 w-4" /></Link>
            <LanguageToggle className="hidden sm:inline-flex" />
            <ProfileMenu />
          </div>
        </div>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="dark w-72 border-border bg-background p-4 text-foreground">
          <SheetTitle className="sr-only">Console menu</SheetTitle>
          <SidebarBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex flex-1">
        {allowed && (
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-border p-4 md:block">
            <SidebarBody />
          </aside>
        )}
        <div className="min-w-0 flex-1">
          {allowed ? (
            <Outlet />
          ) : (
            <div className="mx-auto max-w-md px-6 py-24 text-center">
              <h1 className="text-xl font-semibold">Geen toegang</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Als editor in deze workspace kun je de Developer Console en API &amp; Webhooks niet gebruiken. Wissel bovenaan naar Persoonlijk of vraag een admin om een andere rol.
              </p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
