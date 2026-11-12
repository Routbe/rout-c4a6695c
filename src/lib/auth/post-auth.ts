/**
 * Shared, runtime-neutral rules for where a user lands after signing in.
 * Every sign-in method returns to `POST_AUTH_PATH`, a server route that
 * resolves the session and issues a single 303 to the final page.
 */
export const POST_AUTH_PATH = "/auth/continue";
export const SIGN_IN_PATH = "/auth/sign-in";
export const DEFAULT_DESTINATION = "/dashboard";

/** A signed-in member never crosses deployment boundaries through a next cookie. */
export function postAuthDestination(mode: "public" | "admin" | "all", next: string | null): string {
  if (mode === "admin") return next && /^\/admin(?:\/|\?|$)/.test(next) ? next : "/admin";
  if (mode === "public" && next && /^\/admin(?:\/|\?|$)/.test(next)) return DEFAULT_DESTINATION;
  return next ?? DEFAULT_DESTINATION;
}

/** HttpOnly cookie holding the intended destination (path only). */
export const NEXT_COOKIE = "rout_next";
/** HttpOnly cookie holding the anonymous tour draft token. */
export const TOUR_DRAFT_COOKIE = "rout_tour_draft";

/** Error codes that may appear in `/auth/sign-in?error=…`. Anything else is collapsed. */
export const AUTH_ERROR_CODES = [
  "method_disabled",
  "provider_rejected",
  "provider_not_configured",
  "session_missing",
  "state_mismatch",
  "link_expired",
  "access_denied",
  "account_not_linked",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** Only same-origin absolute paths; never `//host`, schemes or auth routes (loops). */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  if (value.startsWith("/auth") || value.startsWith("/api/")) return null;
  const [path, query = ""] = value.split("?");
  // "Login met ROUT": the authorize request must survive sign-in intact (state, PKCE).
  if (path === "/oauth/authorize") return value;
  // Strip auth-ish query state so it never lands in history.
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (/^(token|code|state|error|success|draft)$/i.test(key)) params.delete(key);
  }
  const rest = params.toString();
  return rest ? `${path}?${rest}` : (path ?? "/");
}

/** Map raw Better Auth / provider error strings to a clean public code. */
export function cleanAuthError(raw: string | null | undefined): AuthErrorCode {
  const v = (raw ?? "").toLowerCase();
  if (!v) return "provider_rejected";
  if (/account[ _]not[ _]linked|email_conflict/.test(v)) return "account_not_linked";
  if (v.includes("not_configured") || v.includes("provider_not_found")) return "provider_not_configured";
  if (v.includes("state")) return "state_mismatch";
  if (v.includes("expired") || v.includes("invalid_token") || v.includes("invalid token")) return "link_expired";
  if (v.includes("access_denied") || v.includes("denied")) return "access_denied";
  if (v.includes("session")) return "session_missing";
  return "provider_rejected";
}
