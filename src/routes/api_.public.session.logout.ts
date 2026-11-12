import { createFileRoute } from "@tanstack/react-router";
import { APP_SESSION_COOKIE } from "@/lib/app-session.server";

/**
 * Wist het eigen ROUT-sessiekoekje (gebruikt door aanmeldwijzen buiten Neon
 * Auth, zoals Bluesky). Neon Auth wist zijn eigen cookie apart.
 */
function clear(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `${APP_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api_/public/session/logout")({
  server: {
    handlers: {
      POST: async () => clear(),
      GET: async () => clear(),
    },
  },
});
