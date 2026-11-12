import { Link } from "@tanstack/react-router";
import { AlertTriangle, RotateCcw, Send } from "lucide-react";
import { problemReportHref } from "@/lib/problem-report";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StaleChunkReload, willAutoReload } from "@/components/ErrorBoundary";
import { useTranslation } from "react-i18next";

/**
 * Route-level crash screen.
 *
 * Registered as `errorComponent` on every page route so a failing loader or a
 * render-time exception degrades into a recoverable card instead of blanking
 * the whole app. Component-level crashes are still caught by <ErrorBoundary>.
 */
export function RouteErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  const { t } = useTranslation();
  if (willAutoReload(error)) return <StaleChunkReload error={error} />;
  console.error("[RouteError]", error);

  const showStack = import.meta.env.DEV || import.meta.env.MODE !== "production";

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl space-y-4 rounded-3xl border border-border bg-card p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="font-display text-xl text-foreground">{t("ui.pageError")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("ui.pageErrorDescription")}
        </p>
        <p className="break-words rounded-xl bg-muted/50 px-3 py-2 text-left font-mono text-xs text-destructive">
          {error.name}: {error.message || t("ui.unknownError")}
        </p>
        {showStack && error.stack ? (
          <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-muted/40 p-3 text-left font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
            {error.stack}
          </pre>
        ) : null}

        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => (reset ? reset() : window.location.reload())} className="gap-2">
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("ui.retry")}
          </Button>
          <Button asChild variant="outline">
            <Link to="/">{t("ui.home")}</Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <a href={problemReportHref(error, typeof window !== "undefined" ? window.location.pathname : "")}>
              <Send className="h-4 w-4" aria-hidden />
              {t("ui.report")}
            </a>
          </Button>
        </div>
      </div>
    </main>
  );
}

/**
 * Neutral page skeleton used as `pendingComponent`.
 *
 * Reserves roughly the height of a real page so a slow loader cannot shift the
 * layout when the content arrives.
 */
export function RoutePendingSkeleton() {
  const { t } = useTranslation();
  return (
    <main
      className="mx-auto w-full max-w-5xl space-y-6 px-4 py-12"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{t("ui.loading")}</span>
      <Skeleton className="h-7 w-40 rounded-full" />
      <Skeleton className="h-11 w-3/4 rounded-2xl" />
      <Skeleton className="h-5 w-2/3 rounded-full" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
      <Skeleton className="h-32 rounded-3xl" />
    </main>
  );
}
