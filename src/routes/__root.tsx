import { CommandPalette } from "@/components/CommandPalette";
import { useLiquidGlassRuntime } from "@/components/glass/LiquidGlass";
import { TourHost } from "@/components/tour/TourHost";
import { InAppBrowserBanner } from "@/components/pwa/InAppBrowserBanner";
import { IosInstallHint } from "@/components/pwa/IosInstallHint";
import { StepUpDialog } from "@/components/auth/StepUpDialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { BrandedHeadContent } from "@/components/seo/BrandedHeadContent";
import { SEO_KEYWORDS, knowledgeGraphScripts } from "@/lib/knowledge-graph";
import { BRAND } from "@/lib/page-title";
import { useRouterState } from "@tanstack/react-router";
import { DevModeToggle } from "@/components/DevModeToggle";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "@/hooks/useTheme";
import { BOOT_SCRIPT, DEFAULT_UI_PREFERENCES, isInternalInterface } from "@/lib/internal-interface-theme";
import { readRequestUiPreferences } from "@/lib/ui-preferences-request";
import { UiPreferencesSeed, useUiPreferences } from "@/hooks/useUiPreferences";
import { UiPreferenceAccountSync } from "@/components/settings/UiPreferenceAccountSync";
import { KeyHaptics } from "@/components/settings/KeyHaptics";
import { useMatches } from "@tanstack/react-router";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/hooks/useAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ErrorBoundary, StaleChunkReload, willAutoReload } from "@/components/ErrorBoundary";
import { LanguageSync } from "@/components/LanguageSync";
import "@/lib/env";
import { notFound, redirect } from "@tanstack/react-router";
import { appMode, detectShellMode, isAdminMode, isAdminPath, isModeFixed, modeDecision } from "@/lib/app-mode";

// Shells load lazily; the public build statically drops the admin shell (dead branch), so no admin code leaks.
const PublicAppShell = lazy(() => import("@/components/shells/PublicAppShell"));
const AdminAppShell =
  import.meta.env["VITE_APP_MODE"] === "public" ? null : lazy(() => import("@/components/shells/AdminAppShell"));

function ShellSwitch({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [previewAdminAuth, setPreviewAdminAuth] = useState(false);
  useEffect(() => {
    setPreviewAdminAuth(!isModeFixed() && path.startsWith("/auth") && detectShellMode() === "admin");
  }, [path]);
  const Shell = AdminAppShell && (isAdminMode() || isAdminPath(path) || previewAdminAuth) ? AdminAppShell : PublicAppShell;
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const [stale] = useState(() => willAutoReload(error));
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  if (stale) return <StaleChunkReload error={error} />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Same split-brain decision as the server middleware, so client navigation obeys it too.
  beforeLoad: async ({ location }) => {
    const d = modeDecision(appMode(), location.pathname);
    if (d.kind === "notFound") throw notFound();
    if (d.kind === "redirect") throw redirect({ href: d.to });
    return { uiPreferences: await readRequestUiPreferences() };
  },
  head: () => ({
    meta: [
      ...(isAdminMode() ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" },
      { title: BRAND },
      {
        name: "description",
        content:
          "ROUT is het soevereine besturingssysteem voor je digitale identiteit: één geverifieerde identiteit, privé-relais, Login met ROUT en routing aan de edge. Open source en Europees.",
      },
      { name: "author", content: "ROUT" },
      { name: "keywords", content: SEO_KEYWORDS.join(", ") },
      { property: "og:title", content: BRAND },
      {
        property: "og:description",
        content:
          "ROUT is het soevereine besturingssysteem voor je digitale identiteit: één geverifieerde identiteit, privé-relais, Login met ROUT en routing aan de edge. Open source en Europees.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // Statusbalk van de browser volgt de huisstijl, licht én donker.
      // Light variant is rendered in RootShell: head() keeps only one tag per name.
      { name: "theme-color", content: "#0B0B0C", media: "(prefers-color-scheme: dark)" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "ROUT" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "application-name", content: "ROUT" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "alternate", type: "application/json", href: "/.well-known/rout-agent.json", title: "ROUT agent sandbox (AI agents: build a workspace without an account)" },
      { rel: "icon", href: "/favicon.png?v=rout-transparent-3", type: "image/png", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=rout-bunny-2", sizes: "180x180" },
    ],
    // Knowledge graph for search engines and AI crawlers; dropped on member pages by BrandedHeadContent.
    scripts: isAdminMode() ? [] : knowledgeGraphScripts(),
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const routeIds = useMatches({ select: matches => matches.map(match => match.routeId) });
  const internalUi = isInternalInterface(pathname, routeIds);
  const seed = Route.useRouteContext({ select: context => context.uiPreferences }) ?? DEFAULT_UI_PREFERENCES;
  return (
    <UiPreferencesSeed.Provider value={seed}>
      <DocumentShell internalUi={internalUi}>{children}</DocumentShell>
    </UiPreferencesSeed.Provider>
  );
}

/**
 * Server HTML already carries the cookie-mirrored material and explicit colour
 * mode; BOOT_SCRIPT corrects device-only or system choices before first paint.
 */
function DocumentShell({ internalUi, children }: { internalUi: boolean; children: ReactNode }) {
  const { material, mode } = useUiPreferences();
  return (
    <html lang="en" className={mode === "dark" ? "dark" : undefined} data-workspace-ui={internalUi ? "internal" : undefined}
      data-theme={internalUi ? material : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <BrandedHeadContent />
        {/* After the route tags, so a page accent colour (no media) still wins. */}
        <meta name="theme-color" content="#FAFAFA" media="(prefers-color-scheme: light)" />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useLiquidGlassRuntime();
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Offline registration is disabled until a service worker is configured here.
    // Remove historical tracking storage; any new attribution stays in memory.
    void import("@/lib/referral").then((m) => { m.clearReferrer(); m.captureReferralFromUrl(); });
    // Preview/dev: a chosen admin shell opens the portal from the home page.
    if (!isModeFixed() && window.location.pathname === "/" && detectShellMode() === "admin") {
      void router.navigate({ to: "/admin" } as never);
    }
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <StepUpDialog />
            <AuthProvider>
              <LanguageSync />
              <UiPreferenceAccountSync />
              <KeyHaptics />
              <ErrorBoundary>
                  {/* Required: nested routes render here. */}
                  <ShellSwitch>
                    <Outlet />
                  </ShellSwitch>
                  <DevModeToggle />
                  <CommandPalette />
                  <TourHost />
                  <InAppBrowserBanner />
                  <IosInstallHint />
              </ErrorBoundary>
            </AuthProvider>
          </TooltipProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
