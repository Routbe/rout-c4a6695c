import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, ChevronDown, Trash2, Send } from "lucide-react";
import { problemReportHref } from "@/lib/problem-report";
import { Button } from "@/components/ui/button";
import { i18n } from "@/lib/i18n";
import { useTranslation } from "react-i18next";

interface Props {
  children: ReactNode;
  label?: string;
  resetKey?: unknown;
  inline?: boolean;
}
interface State {
  error: Error | null;
  info: ErrorInfo | null;
  detailsOpen: boolean;
}

const STALE_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i;
const RELOAD_KEY = "rout_stale_chunk_reload";

/** After a deploy, old tabs request removed files; reload once to fetch the new version. */
export function reloadForStaleChunk(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!STALE_RE.test(message)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** True when this error is a stale-deploy chunk miss that a single reload will fix. */
export function willAutoReload(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!STALE_RE.test(message)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    return Date.now() - last >= 30_000;
  } catch {
    return false;
  }
}

/** Quiet screen shown instead of the crash card while a new version loads. */
export function StaleChunkReload({ error }: { error: unknown }) {
  const { t } = useTranslation();
  useEffect(() => { reloadForStaleChunk(error); }, [error]);
  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] w-full items-center justify-center px-4 py-10 text-sm text-muted-foreground">
      <RotateCcw className="mr-2 h-4 w-4 animate-spin" aria-hidden /> {t("ui.newVersion")}
    </div>
  );
}


if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForStaleChunk((event as Event & { payload?: unknown }).payload ?? new Error("Failed to fetch dynamically imported module"))) event.preventDefault();
  });
  window.addEventListener("unhandledrejection", (event) => { reloadForStaleChunk(event.reason); });
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null, detailsOpen: false };
  private reloading = false;
  private languageChanged = () => this.forceUpdate();
  override componentDidMount() { i18n.on("languageChanged", this.languageChanged); }
  override componentWillUnmount() { i18n.off("languageChanged", this.languageChanged); }
  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (reloadForStaleChunk(error)) { this.reloading = true; return; }
    console.error("[ErrorBoundary]", this.props.label ?? "app", error, info);
    this.setState({ info });
  }
  override componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey)
      this.setState({ error: null, info: null, detailsOpen: false });
  }
  private retry = () => this.setState({ error: null, info: null, detailsOpen: false });
  private reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };
  private resetCache = () => {
    void (async () => {
      try {
        if (typeof window !== "undefined") {
          const keep = /^(sb-|db)/i;
          const doomed: string[] = [];
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (key && !keep.test(key)) doomed.push(key);
          }
          doomed.forEach((key) => window.localStorage.removeItem(key));
          window.sessionStorage.clear();
          // Also drop cached API responses and stale chunks so a corrupt
          // cache cannot re-trigger the same crash after reload.
          if ("caches" in window) {
            const names = await window.caches.keys();
            await Promise.all(names.map((name) => window.caches.delete(name)));
          }
        }
      } catch {
        // best-effort cleanup; ignore storage errors
      }
      this.reload();
    })();
  };
  override render() {
    const { error, info, detailsOpen } = this.state;
    if (!error) return this.props.children;
    if (!this.props.inline && STALE_RE.test(error.message) && (willAutoReload(error) || this.reloading)) return <StaleChunkReload error={error} />;
    const stack = [error.stack ?? `${error.name}: ${error.message}`, info?.componentStack]
      .filter(Boolean)
      .join("\n\n");
    return (
      <div
        role="alert"
        className={
          this.props.inline
            ? "w-full rounded-2xl border-2 border-foreground bg-card p-5 text-center"
            : "flex min-h-[60vh] w-full items-center justify-center px-4 py-10"
        }
      >
        <div className="mx-auto w-full max-w-lg space-y-4 rounded-2xl border-2 border-foreground bg-card p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
            <AlertTriangle className="h-5 w-5 text-foreground" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-medium">
              {this.props.label ? i18n.t("ui.componentError", { label: this.props.label }) : i18n.t("ui.error")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {i18n.t("ui.errorDescription")}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={this.reload}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
              {i18n.t("ui.reload")}
            </Button>
            <Button variant="outline" onClick={this.retry}>
              {i18n.t("ui.retry")}
            </Button>
            <Button variant="outline" onClick={this.resetCache}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              {i18n.t("ui.resetCache")}
            </Button>
            <Button asChild variant="outline">
              <a href={problemReportHref({ name: error.name, message: error.message, stack }, typeof window !== "undefined" ? window.location.pathname : "")}>
                <Send className="mr-2 h-4 w-4" aria-hidden />
                {i18n.t("ui.report")}
              </a>
            </Button>
          </div>
          <div className="pt-1 text-left">
            <button
              type="button"
              onClick={() => this.setState((s) => ({ detailsOpen: !s.detailsOpen }))}
              aria-expanded={detailsOpen}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 ${detailsOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
              {i18n.t("ui.errorDetails")}
            </button>
            {detailsOpen && (
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-border bg-muted/60 p-3 text-left font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
                {stack}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  }
}
