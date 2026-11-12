import { createFileRoute } from "@tanstack/react-router";

const STATE_COOKIE = "rout_bsky_state";
import { linkIntentCookie } from "@/lib/link-intent";
import { configuredAuthOrigin } from "@/lib/auth-origin";

/** Stap 1 van de Bluesky-login: stuur het lid door naar zijn eigen server. */
export const Route = createFileRoute("/api_/public/bluesky/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const handle = url.searchParams.get("handle") ?? "";
        const next = url.searchParams.get("next") ?? "/dashboard";
        const { canonicalAppUrl, isApprovedHost } = await import("@/lib/app-url");
        const host = request.headers.get("host") ?? "";
        const origin =
          configuredAuthOrigin(process.env) ||
          (isApprovedHost(host) && !host.startsWith("localhost")
            ? `https://${host}`
            : canonicalAppUrl());

        try {
          const { startBlueskyLogin, sealBlueskyState, blueskyOriginProblem, isApprovedBlueskyAuthUrl } = await import("@/lib/bluesky-auth.server");
          const problem = blueskyOriginProblem(origin);
          if (problem) {
            console.warn(`[bluesky] login blocked: ${problem} (origin=${origin})`);
            throw Object.assign(new Error(problem), { name: "BlueskyBlocked" });
          }
          const { url: authorizeUrl, state } = await startBlueskyLogin({ handle, origin, next });
          // Defense in depth: never redirect a visitor off-site to an unapproved host.
          if (!isApprovedBlueskyAuthUrl(authorizeUrl)) {
            throw new Error("unapproved_bluesky_auth_server");
          }
          const sealed = await sealBlueskyState(state);
          const headers = new Headers({ location: authorizeUrl });
          headers.append("set-cookie", `${STATE_COOKIE}=${encodeURIComponent(sealed)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`);
          headers.append("set-cookie", linkIntentCookie(url.searchParams.get("link") === "1"));
          return new Response(null, { status: 302, headers });
        } catch (error) {
          // `problem` (vaste configuratiemelding) mag zichtbaar zijn; andere fouten niet.
          const message =
            error instanceof Error && error.name === "BlueskyBlocked"
              ? error.message
              : "Er is een tijdelijk verbindingsprobleem opgetreden.";
          const { logServerError } = await import("@/lib/security/safe-errors");
          logServerError("auth.bluesky.start", error);
          return new Response(null, {
            status: 302,
            headers: { location: `/auth/sign-in?bluesky_error=${encodeURIComponent(message)}` },
          });
        }
      },
    },
  },
});
