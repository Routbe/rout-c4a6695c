import { createFileRoute } from "@tanstack/react-router";
import { linkIntentCookie } from "@/lib/link-intent";

/**
 * Stap 1 van de Mastodon/Fediverse-login: ROUT registreert zich (indien nodig)
 * op de server die het lid opgeeft en stuurt daarna door naar de inlogpagina
 * van die server. De clientsecret van die instance blijft server-side.
 *
 * Open-redirect-bescherming: een link die niet vanaf een ROUT-pagina komt,
 * stuurt nooit meteen door naar een onbekende server. De bezoeker ziet eerst
 * een ROUT-pagina met de servernaam en bevestigt via een same-origin POST.
 */

async function redirectToInstance(
  request: Request,
  input: { instance: string; next: string; link: boolean },
  status: 302 | 303,
): Promise<Response> {
  const { canonicalAppUrl, isApprovedHost } = await import("@/lib/app-url");
  const host = request.headers.get("host") ?? "";
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"]?.replace(/\/$/, "") ||
    (isApprovedHost(host) && !host.startsWith("localhost")
      ? `https://${host}`
      : canonicalAppUrl());

  try {
    const { buildMastodonAuthorizeUrl } = await import("@/lib/mastodon-auth.server");
    const { url: authorizeUrl } = await buildMastodonAuthorizeUrl({
      instance: input.instance,
      origin,
      next: input.next,
    });
    const headers = new Headers({ location: authorizeUrl });
    headers.append("set-cookie", linkIntentCookie(input.link));
    return new Response(null, { status, headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Aanmelden via Mastodon mislukte.";
    return new Response(null, {
      status: 303,
      headers: { location: `/auth/sign-in?mastodon_error=${encodeURIComponent(message)}` },
    });
  }
}

function signInError(message: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: `/auth/sign-in?mastodon_error=${encodeURIComponent(message)}` },
  });
}

export const Route = createFileRoute("/api_/public/mastodon/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Strikte IP-rate limit: registratie doet een uitgaand netwerkverzoek.
        const { guardShared } = await import("@/lib/rate-limit-db.server");
        const limited = await guardShared(request, "mastodon-start", { limit: 10, windowSec: 60 });
        if (limited) return limited;

        const url = new URL(request.url);
        const rawInstance = url.searchParams.get("instance") ?? "";
        const next = url.searchParams.get("next") ?? "/dashboard";
        const link = url.searchParams.get("link") === "1";

        const { normalizeInstance } = await import("@/lib/mastodon-instance");
        const instance = normalizeInstance(rawInstance);
        if (!instance) {
          return signInError(
            "That does not look like a Fediverse domain — try mastodon.social or your own server.",
          );
        }

        const { mayRedirectDirectly, confirmInstancePage } = await import(
          "@/lib/mastodon-start-rules"
        );
        if (!mayRedirectDirectly(instance, request.headers.get("sec-fetch-site"))) {
          const dutch = /^nl\b/i.test(request.headers.get("accept-language") ?? "");
          return new Response(confirmInstancePage({ instance, next, link, dutch }), {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
              "referrer-policy": "no-referrer",
              "x-robots-tag": "noindex",
            },
          });
        }

        return redirectToInstance(request, { instance, next, link }, 302);
      },
      POST: async ({ request }) => {
        const { guardShared } = await import("@/lib/rate-limit-db.server");
        const limited = await guardShared(request, "mastodon-start", { limit: 10, windowSec: 60 });
        if (limited) return limited;

        const { isApprovedHost } = await import("@/lib/app-url");
        const { isTrustedConfirmOrigin } = await import("@/lib/mastodon-start-rules");
        if (
          !isTrustedConfirmOrigin(
            request.headers.get("origin"),
            request.headers.get("host"),
            isApprovedHost,
          )
        ) {
          return new Response("Forbidden", { status: 403 });
        }

        const form = await request.formData().catch(() => null);
        const value = (key: string) => {
          const v = form?.get(key);
          return typeof v === "string" ? v.slice(0, 512) : "";
        };
        const { normalizeInstance } = await import("@/lib/mastodon-instance");
        const instance = normalizeInstance(value("instance"));
        if (!instance) {
          return signInError(
            "That does not look like a Fediverse domain — try mastodon.social or your own server.",
          );
        }
        return redirectToInstance(
          request,
          { instance, next: value("next") || "/dashboard", link: value("link") === "1" },
          303,
        );
      },
    },
  },
});
