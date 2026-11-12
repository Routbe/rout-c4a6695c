import { createFileRoute } from "@tanstack/react-router";
import { clearLinkIntent, maybeLinkToCurrentUser } from "@/lib/link-intent";
import { configuredAuthOrigin } from "@/lib/auth-origin";

const STATE_COOKIE = "rout_bsky_state";
const PENDING_COOKIE = "rout_fedi_pending";

/** Alleen onze eigen, vaste meldingen gaan naar de bezoeker; al het andere wordt generiek. */
const VISITOR_SAFE_MESSAGES = new Set([
  "Deze inlogpoging is verlopen. Probeer opnieuw.",
  "Deze inlogpoging is niet geldig.",
]);

function blueskyFailureMessage(error: unknown): string {
  if (error instanceof Error && VISITOR_SAFE_MESSAGES.has(error.message)) return error.message;
  return "Er is een tijdelijk verbindingsprobleem opgetreden.";
}

function redirectTo(location: string, cookies: string[] = []) {
  const headers = new Headers({ location });
  cookies.forEach((c) => headers.append("set-cookie", c));
  return new Response(null, { status: 302, headers });
}

/**
 * Stap 2 van de Bluesky-login. Is de Bluesky-account al aan een ROUT-account
 * gekoppeld, dan is het lid meteen ingelogd. Zo niet, dan vragen we eerst een
 * e-mailadres — zonder e-mail bestaat er geen ROUT-account.
 */
export const Route = createFileRoute("/api_/public/bluesky/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const failure = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        const clear = `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;

        if (failure || !code || !returnedState) {
          const message = failure
            ? "Bluesky heeft de aanmelding geweigerd. Probeer het opnieuw."
            : "De aanmelding bij Bluesky is afgebroken.";
          console.error("[bluesky] callback rejected", {
            providerRejected: Boolean(failure),
            hasCode: Boolean(code),
            hasState: Boolean(returnedState),
          });
          return redirectTo(`/auth/sign-in?error=provider_rejected&bluesky_error=${encodeURIComponent(message)}`, [clear]);
        }

        try {
          const { readCookie } = await import(
            "@/lib/app-session.server"
          );
          const { openBlueskyState, completeBlueskyLogin } = await import(
            "@/lib/bluesky-auth.server"
          );
          const { canonicalAppUrl, isApprovedHost } = await import("@/lib/app-url");

          const host = request.headers.get("host") ?? "";
          const origin =
            configuredAuthOrigin(process.env) ||
            (isApprovedHost(host) && !host.startsWith("localhost")
              ? `https://${host}`
              : canonicalAppUrl());

          const sealed = readCookie(request.headers.get("cookie") ?? "", STATE_COOKIE);
          if (!sealed) throw new Error("Deze inlogpoging is verlopen. Probeer opnieuw.");
          const state = await openBlueskyState(sealed);
          if (state.state !== returnedState) throw new Error("Deze inlogpoging is niet geldig.");

          const result = await completeBlueskyLogin({ code, state, origin });

          const linked = await maybeLinkToCurrentUser(request, "bluesky", result.did, result.handle);
          if (linked) return redirectTo(linked, [clear, clearLinkIntent()]);

          const { federatedSignInResponse } = await import("@/lib/auth/fediverse-session.server");
          const response = await federatedSignInResponse(request, "bluesky", result.did);
          response.headers.append("set-cookie", clear);
          return response;
        } catch (error) {
          const { logServerError } = await import("@/lib/security/safe-errors");
          logServerError("auth.bluesky.callback", error);
          return redirectTo(
            `/auth/sign-in?error=provider_rejected&bluesky_error=${encodeURIComponent(blueskyFailureMessage(error))}`,
            [clear],
          );
        }
      },
    },
  },
});
