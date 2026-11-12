/**
 * Split-brain deployment mode (client-safe).
 *
 *   public — rout.be: every /admin surface is a hard 404.
 *   admin  — rout.dlp.li: only the admin portal + its sign-in; no social login, noindex.
 *   all    — unset (preview / single deploy): everything served, as before.
 *
 * Set via VITE_APP_MODE (build time, both bundles); the server also honours APP_MODE.
 */
export type AppMode = "public" | "admin" | "all";

const parse = (v: unknown): AppMode | null => (v === "public" || v === "admin" ? v : null);

export function appMode(): AppMode {
  const built = parse(import.meta.env["VITE_APP_MODE"]);
  // A server override cannot reopen routes removed from a pinned client build.
  if (built) return built;
  const server = typeof process !== "undefined" ? parse(process.env?.["APP_MODE"]) : null;
  return server ?? "all";
}

export const isAdminMode = () => appMode() === "admin";
export const isPublicMode = () => appMode() === "public";

/** Admin-only surfaces (pages + raw API). */
export function isAdminPath(pathname: string): boolean {
  return /^\/(admin|api_?\/admin)(\/|$)/.test(pathname);
}

/** Paths the admin portal may serve; everything else redirects to the admin sign-in. */
export function isAdminPortalPath(pathname: string): boolean {
  return (
    isAdminPath(pathname) ||
    /^\/auth(?:\/(?:sign-in|continue|reset-password))?\/?$/.test(pathname) ||
    /^\/api_?\/auth(?:\/|$)/.test(pathname) ||
    /^\/(?:_serverFn|assets|@(vite|fs|id|react-refresh)|src|node_modules|__)(?:\/|$)/.test(pathname) ||
    /^\/api\/public\/(?:altcha|auth\/providers|session\/logout|health|avatar|proxy-image)(?:\/|$)/.test(pathname) ||
    /^\/api\/public\/cron(?:\/|$)/.test(pathname) ||
    /^\/(?:favicon\.(?:ico|png|svg)|apple-touch-icon\.png|icon-\d+\.png|manifest\.json|robots\.txt)$/.test(pathname)
  );
}

export type ModeDecision = { kind: "allow" } | { kind: "notFound" } | { kind: "redirect"; to: string };

/** Single routing decision used by both the server middleware and the router. */
export function modeDecision(mode: AppMode, pathname: string): ModeDecision {
  if (mode === "public" && isAdminPath(pathname)) return { kind: "notFound" };
  if (mode === "admin" && !isAdminPortalPath(pathname)) {
    return { kind: "redirect", to: "/auth/sign-in?redirect=%2Fadmin" };
  }
  return { kind: "allow" };
}

/** Social/OAuth sign-in is never allowed on the admin portal. */
export function socialLoginAllowed(mode: AppMode): boolean {
  return mode !== "admin";
}

/* ---------- Client shell mode (UI only — never a security decision) ---------- */

export type ShellMode = "public" | "admin";
export const MODE_OVERRIDE_KEY = "app:mode-override";
const shell = (v: unknown): ShellMode | null => (v === "public" || v === "admin" ? v : null);

/** Fixed when the build pins VITE_APP_MODE; overrides are then ignored and the switcher hidden. */
export const isModeFixed = () => shell(import.meta.env["VITE_APP_MODE"]) !== null;

/**
 * Which shell the browser should show. Priority: build env → hostname (admin.*, rout.dlp.li)
 * → ?mode= → localStorage override → "public". Call only after hydration (reads window).
 * Server-side access rules still come from appMode() + assertAdminRole.
 */
export function detectShellMode(): ShellMode {
  const fixed = shell(import.meta.env["VITE_APP_MODE"]);
  if (fixed) return fixed;
  if (typeof window === "undefined") return "public";
  const host = window.location.hostname;
  if (host.startsWith("admin.") || host === "rout.dlp.li") return "admin";
  const param = shell(new URLSearchParams(window.location.search).get("mode"));
  if (param) return param;
  try {
    const stored = shell(window.localStorage.getItem(MODE_OVERRIDE_KEY));
    if (stored) return stored;
  } catch {
    /* storage blocked */
  }
  return "public";
}

/** Dev/preview only: never on a pinned production build. */
export function canSwitchShellMode(): boolean {
  if (isModeFixed() || typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  const h = window.location.hostname;
  return h === "localhost" || h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com");
}
