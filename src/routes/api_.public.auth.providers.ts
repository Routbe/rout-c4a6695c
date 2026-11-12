import { createFileRoute } from "@tanstack/react-router";
import { authConfigurationReadiness } from "@/lib/auth-readiness";

/**
 * Public: which sign-in providers are configured. Names only — never values.
 * `?diagnose=1` adds which key NAMES are missing and the callback URLs to
 * register at Google/GitHub/…; still no secret values.
 */
export const Route = createFileRoute("/api_/public/auth/providers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { enabledProviders, authDiagnostics, liveAuthChecks, resolveAuthSecret } = await import("@/lib/better-auth.server");
        const { hasDatabase } = await import("@/lib/neon");
        const readiness = authConfigurationReadiness(hasDatabase(), Boolean(resolveAuthSecret()));
        const diagnose = new URL(request.url).searchParams.get("diagnose") === "1";
        return Response.json(
          diagnose
            ? { enabled: enabledProviders(), ...authDiagnostics(request), live: await liveAuthChecks() }
            : { providers: [...enabledProviders(), ...((process.env["APP_SESSION_SECRET"] || process.env["NEON_AUTH_COOKIE_SECRET"]) ? ["mastodon", "bluesky"] : [])], readiness },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
