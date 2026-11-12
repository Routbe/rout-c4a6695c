import { BRAND, LOGO_INNER, LOGO_VIEWBOX } from "@/lib/brand/logo";

export const ROUT_BUTTON_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}" width="22" height="22" fill="currentColor" aria-hidden="true"><g>${LOGO_INNER}</g></svg>`;

/** These are routes the integrator implements, never ROUT authorization URLs. */
export type RoutButtonTheme = "light" | "dark";

export type RoutButtonMode = "login" | "connect" | "verify";

export const ROUT_BUTTON_LABELS: Record<RoutButtonMode, string> = {
  login: "Doorgaan met ROUT",
  connect: "Verbinden met ROUT",
  verify: "Verifiëren met ROUT",
};

export function routButtonSnippet(mode: RoutButtonMode, theme: RoutButtonTheme = "dark") {
  const label = ROUT_BUTTON_LABELS[mode];
  return `<!-- Implement this POST handler in YOUR app before enabling this button.
It creates state, nonce and PKCE, then redirects using OIDC discovery.
Connect requires an existing local session and never replaces that session.
Verify also requires an existing local session: it starts a NEW authorization request
with the extra scopes (e.g. "openid sybil:verify identity:legal_name"); ROUT then asks
the member only for what is new and keeps earlier permissions.
Include your framework's CSRF field/protection in this form. -->
<form method="post" action="/auth/rout/${mode}">
  <button class="rout-button rout-button--${theme}" type="submit">
    ${ROUT_BUTTON_LOGO}
    <span>${label}</span>
  </button>
</form>
<style>
  .rout-button--light { --rout-button-bg: ${BRAND.paper}; --rout-button-ink: ${BRAND.ink}; --rout-button-edge: ${BRAND.ink}; }
  .rout-button--dark { --rout-button-bg: ${BRAND.ink}; --rout-button-ink: ${BRAND.paper}; --rout-button-edge: ${BRAND.ink}; }
  .rout-button { display: inline-flex; align-items: center; justify-content: center;
    gap: 10px; min-height: 48px; padding: 12px 22px; border-radius: 9999px;
    background: var(--rout-button-bg); color: var(--rout-button-ink);
    border: 2px solid var(--rout-button-edge); box-shadow: 3px 3px 0 var(--rout-button-edge);
    font: 600 15px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: -0.01em;
    cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
  .rout-button:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--rout-button-edge); }
  .rout-button:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--rout-button-edge); }
  .rout-button svg { width: 22px; height: 22px; flex-shrink: 0; }
  .rout-button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
  .rout-button:disabled { opacity: .5; cursor: not-allowed; }
</style>`;
}