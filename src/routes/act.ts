import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /act?t=<ticket> — temporary human-in-the-loop link handed out by agent
 * APIs. A valid, unexpired ticket redirects to its fixed in-app page (which
 * still requires sign-in); anything else answers 410 without redirecting.
 */
export const Route = createFileRoute("/act")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ticket = new URL(request.url).searchParams.get("t") ?? "";
        const { resolveAuthSecret } = await import("@/lib/better-auth.server");
        const secret = resolveAuthSecret()?.secret;
        const { verifyActionTicket } = await import("@/lib/agent/action-ticket");
        const check = secret ? await verifyActionTicket(secret, ticket, Math.floor(Date.now() / 1000)) : { ok: false as const, reason: "invalid" as const };
        if (check.ok) return new Response(null, { status: 302, headers: { location: check.target, "cache-control": "no-store" } });
        const text = check.reason === "expired"
          ? "Deze link is verlopen. Vraag je assistent om een nieuwe. / This link has expired. Ask your assistant for a new one."
          : "Deze link is ongeldig. / This link is invalid.";
        return new Response(text, { status: 410, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      },
    },
  },
});
