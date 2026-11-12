import { findMatchingRedirect } from "./redirect-match";

/**
 * OpenID Connect RP-Initiated Logout 1.0 — pure validation.
 * A post_logout_redirect_uri is honoured only when it is registered for the
 * client identified by a valid id_token_hint (or explicit client_id that
 * matches the hint's aud). Otherwise the user lands on ROUT itself.
 */
export type EndSessionDecision =
  | { kind: "redirect"; target: string }
  | { kind: "local" };

export function decideEndSessionRedirect(input: {
  requested: string | null;
  state: string | null;
  hintAud: string | null;
  clientId: string | null;
  registered: string[] | null;
}): EndSessionDecision {
  if (!input.requested) return { kind: "local" };
  if (!input.hintAud) return { kind: "local" };
  if (input.clientId && input.clientId !== input.hintAud) return { kind: "local" };
  if (!input.registered) return { kind: "local" };
  const match = findMatchingRedirect(input.registered, input.requested);
  if (!match) return { kind: "local" };
  const target = new URL(input.requested);
  if (input.state) target.searchParams.set("state", input.state);
  return { kind: "redirect", target: target.toString() };
}

/**
 * Logout CSRF guard: a session is only ended when the request demonstrably comes
 * from ROUT itself (or a typed URL/bookmark). Cross-site GETs carry the Lax
 * session cookie, so they get a confirmation page instead of an instant logout.
 * The Referer header is never read (privacy rule): without Sec-Fetch-Site or
 * Origin the caller gets the confirmation page, which is the safe default.
 */
export function isTrustedLogoutRequest(input: {
  secFetchSite: string | null;
  origin: string | null;
  selfHost: string;
}): boolean {
  const site = input.secFetchSite?.toLowerCase() ?? null;
  if (site) return site === "same-origin" || site === "none";
  const hostOf = (v: string | null) => {
    if (!v || v === "null") return null;
    try {
      return new URL(v).host.toLowerCase();
    } catch {
      return null;
    }
  };
  const self = input.selfHost.toLowerCase();
  const origin = hostOf(input.origin);
  return origin === self;
}
