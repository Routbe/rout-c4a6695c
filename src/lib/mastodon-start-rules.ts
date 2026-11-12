/**
 * Open-redirect guard for /api/public/mastodon/start.
 *
 * The Fediverse lets members use any server, so the instance cannot be
 * allowlisted. Instead a link that did not come from a ROUT page never
 * redirects straight to an unknown server: the visitor first sees a ROUT
 * page naming the server and must confirm with a same-origin form POST.
 */
import { POPULAR_MASTODON_SERVERS } from "./mastodon-servers";

const KNOWN = new Set(POPULAR_MASTODON_SERVERS);

/** True when the GET may redirect immediately to the instance sign-in page. */
export function mayRedirectDirectly(instance: string, secFetchSite: string | null): boolean {
  if (KNOWN.has(instance)) return true;
  return secFetchSite === "same-origin";
}

/** True when a confirming POST really came from a ROUT page. */
export function isTrustedConfirmOrigin(
  originHeader: string | null,
  requestHost: string | null,
  isApprovedHost: (host: string) => boolean,
): boolean {
  if (!originHeader || originHeader === "null") return false;
  let host: string;
  try {
    host = new URL(originHeader).host.toLowerCase();
  } catch {
    return false;
  }
  if (requestHost && host === requestHost.toLowerCase()) return true;
  return isApprovedHost(host);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** Confirmation page shown before leaving ROUT for an unknown server. */
export function confirmInstancePage(input: {
  instance: string;
  next: string;
  link: boolean;
  dutch: boolean;
}): string {
  const host = escapeHtml(input.instance);
  const t = input.dutch
    ? {
        lang: "nl",
        title: "Aanmelden via een Fediverse-server",
        body: `Je gaat ROUT verlaten om je aan te melden bij <strong>${host}</strong>. Deze server wordt niet door ROUT beheerd. Ga alleen verder als je dit adres zelf hebt gekozen en het je eigen server is.`,
        go: `Verder naar ${host}`,
        back: "Annuleren",
      }
    : {
        lang: "en",
        title: "Sign in with a Fediverse server",
        body: `You are about to leave ROUT to sign in at <strong>${host}</strong>. This server is not run by ROUT. Only continue if you chose this address yourself and it is your own server.`,
        go: `Continue to ${host}`,
        back: "Cancel",
      };
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${t.title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.25rem;line-height:1.5}form{display:flex;gap:.75rem;margin-top:1.5rem;flex-wrap:wrap}button,a{font:inherit;padding:.6rem 1rem;border-radius:.5rem;border:1px solid currentColor;background:none;color:inherit;text-decoration:none;cursor:pointer}button{font-weight:600}</style></head><body><h1>${t.title}</h1><p>${t.body}</p><form method="post" action="/api/public/mastodon/start"><input type="hidden" name="instance" value="${host}"><input type="hidden" name="next" value="${escapeHtml(input.next)}"><input type="hidden" name="link" value="${input.link ? "1" : "0"}"><button type="submit">${t.go}</button><a href="/auth/sign-in">${t.back}</a></form></body></html>`;
}
