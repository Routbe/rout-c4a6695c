import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, ChevronRight, HelpCircle } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { RoutLogo } from "@/components/RoutLogo";
import { Footer } from "@/components/Footer";
import { TrustBadgesBar } from "@/components/common/TrustBadgesBar";
import { BackToTop } from "@/components/BackToTop";
import { NameOnboardingDialog } from "@/components/onboarding/NameOnboardingDialog";

import { ProfileMenu } from "@/components/ProfileMenu";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { InviteButton } from "@/components/InviteButton";
import { MobileMenu } from "@/components/MobileMenu";
import { LanguageToggle } from "@/components/LanguageToggle";

import { cn } from "@/lib/utils";
import { useMatches, useRouterState } from "@tanstack/react-router";
import { tourForPath } from "@/lib/tour/definitions";
import { startTour } from "@/lib/tour/progress";
import { usePortalFrame } from "./PortalContext";
import { useHeaderReveal } from "@/hooks/useHeaderReveal";
import { useReveal } from "@/hooks/useReveal";
import { HeaderControls } from "./HeaderControls";

export interface Crumb {
  label: string;
  to?: string;
}

interface AppLayoutProps {
  children: ReactNode;
  /** Page title rendered under the breadcrumbs. */
  title?: string;
  description?: string;
  crumbs?: Crumb[];
  /** Optional actions on the title row. */
  actions?: ReactNode;
  /** Studio uses the full viewport width; the generator uses 'full' (no gutter). */
  width?: "default" | "wide" | "full";
  /** Toont de vertrouwensbalk direct boven de footer (home, about, studio). */
  trustBadges?: boolean;
  /** Fades the footer in once it scrolls into view (Omni-Bar gateway). */
  revealFooter?: boolean;
  /** "obsidian" renders the whole frame (header, page, footer) in the dark palette. */
  tone?: "default" | "obsidian" | "infrastructure";
}

/**
 * Global, indestructible app frame: the header and footer are always visible
 * and only the content between them swaps on navigation, so route changes
 * unmount heavy page state instead of stacking modals in memory.
 */
export function AppLayout({
  children,
  title,
  description,
  crumbs,
  actions,
  width = "default",
  trustBadges = false,
  revealFooter = false,
  tone = "default",
}: AppLayoutProps) {
  const hidden = useHeaderReveal();
  const { t } = useTranslation();
  const Frame = usePortalFrame();
  // Signed-in (OS) routes drop the marketing footer for one quiet status line.
  const isOsRoute = useMatches({ select: (ms) => ms.some((m) => m.routeId.startsWith("/_authenticated")) });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pageTour = isOsRoute ? tourForPath(pathname) : null;
  const heading = (
          (crumbs?.length || title) ? (
            <div className="mb-6 grid grid-cols-1 items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
              <div className="min-w-0">
                {crumbs?.length ? (
                  <nav
                    aria-label={t("ui.breadcrumb")}
                    className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Link to="/" className="hover:text-foreground">
                      ROUT
                    </Link>
                    {crumbs.map((c) => (
                      <span key={c.label} className="flex min-w-0 items-center gap-1">
                        <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
                        {c.to ? (
                          <Link to={c.to} className="truncate hover:text-foreground">
                            {c.label}
                          </Link>
                        ) : (
                          <span className="truncate text-foreground">{c.label}</span>
                        )}
                      </span>
                    ))}
                  </nav>
                ) : null}
                {title ? (
                  <h1 className="flex items-center gap-2 text-[28px] font-medium leading-tight sm:text-[34px]">
                    {title}
                    {pageTour ? (
                      <button
                        type="button"
                        onClick={() => startTour(pageTour)}
                        title={t(`tourEngine.palette.${pageTour}`)}
                        aria-label={t(`tourEngine.palette.${pageTour}`)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                    ) : null}
                  </h1>
                ) : null}
                {description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
              {actions ? <div className="min-w-0 w-full sm:w-auto sm:shrink-0">{actions}</div> : null}
            </div>
          ) : null
  );
  if (Frame) return <Frame heading={heading} width={width}>{children}</Frame>;
  return (
    <div data-hardware-ui className={cn("flex min-h-screen flex-col bg-background pb-[env(safe-area-inset-bottom)] text-foreground", tone !== "default" && "dark", tone === "infrastructure" && "infra-home")}>
      <header
        data-testid="app-header"
        data-hidden={hidden ? "true" : "false"}
        className={cn(
          "fixed left-0 right-0 top-0 z-50 w-full pt-[env(safe-area-inset-top)] border-b border-border/50 bg-background/90 backdrop-blur-md transition-transform duration-300 ease-in-out",
          hidden ? "-translate-y-full" : "translate-y-0",
        )}
      >
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Link to="/" className="shrink-0" aria-label={t("ui.routHome")}>
            <RoutLogo size={28} />
          </Link>
          <div className="hidden sm:block">
            <WorkspaceSwitcher />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link to="/explore" className="hidden px-2 text-sm text-muted-foreground hover:text-foreground sm:inline">
              {t("explore.crumb")}
            </Link>
            <HeaderControls>
              <LanguageToggle className="hidden sm:inline-flex" />
              <InviteButton />
              <ProfileMenu />
              <MobileMenu />
            </HeaderControls>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-[calc(4rem+env(safe-area-inset-top))]">
        <div
          className={cn(
            "mx-auto w-full min-w-0",
            width === "full" ? "max-w-full" : "px-4 py-8 sm:px-6",
            width === "wide" ? "max-w-7xl" : width === "default" ? "max-w-5xl" : "",
          )}
        >
          {heading}

          {children}
        </div>
      </main>

      {trustBadges && !isOsRoute && <TrustBadgesBar className="mt-6" />}
      {isOsRoute ? <OsStatusLine /> : revealFooter ? <RevealedFooter /> : <Footer />}
      <BackToTop />
      <NameOnboardingDialog />
    </div>
  );
}

function OsStatusLine() {
  const { t } = useTranslation();
  return (
    <footer
      data-testid="os-status-line"
      className="sticky bottom-0 z-40 flex h-7 items-center justify-center gap-2 border-t border-border/60 bg-background/90 font-mono text-[11px] text-muted-foreground backdrop-blur"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" aria-hidden />
      {t("ui.systemsOperational")}
    </footer>
  );
}

function RevealedFooter() {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-visible={visible ? "true" : "false"} className="omni-reveal">
      <Footer />
    </div>
  );
}

/** Small stat card used by the dashboard analytics section. */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="acrylic-card p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden /> {label}
      </div>
      <p className="mt-2 text-2xl font-medium">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
