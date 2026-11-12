// Guarded auth endpoint: missing provider credentials fail fast with a readable
// code instead of a generic 500 (see handleAuthRequest below).
import { createFileRoute } from "@tanstack/react-router";
import { authConfigurationReadiness, AUTH_UNAVAILABLE_TEXT } from "@/lib/auth-readiness";
import { logServerError } from "@/lib/security/safe-errors";

/**
 * ROUT's own auth endpoint (self-hosted Better Auth).
 * First factor: passkey, one-time e-mail link or e-mail + password
 * (`sign-in-policy.ts`); with 2FA on, password and e-mail-link sign-ins need a
 * second step. Social providers can only be linked to a signed-in member.
 * Admins can never switch 2FA off.
 */

/** POST endpoints where the provider id travels in the JSON body. */
const SOCIAL_BODY_PATHS = new Set(["/sign-in/social", "/sign-in/oauth2", "/link-social", "/oauth2/link"]);
/** Callback errors that just mean "second/stale hit of the same callback". */
const STALE_CALLBACK_ERRORS = new Set(["state_mismatch", "please_restart_the_process", "invalid_code", "state_not_found"]);

/** Registration endpoints for the first passkey (`context` = sign-up ticket or recovery token). */
const REGISTER_PATHS = new Set(["/passkey/generate-register-options", "/passkey/verify-registration"]);

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** `/callback/<provider>` (built-in) or `/oauth2/callback/<provider>` (generic). */
function providerFromPath(relativePath: string): string | null {
  const match = relativePath.match(/\/callback\/([a-z0-9-]+)$/);
  return match?.[1] ?? null;
}

async function providerFromBody(request: Request, relativePath: string): Promise<string | null> {
  if (request.method !== "POST" || !SOCIAL_BODY_PATHS.has(relativePath)) return null;
  try {
    const body = (await request.clone().json()) as { provider?: unknown; providerId?: unknown };
    const id = body.provider ?? body.providerId;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

const PROVIDER_NOT_CONFIGURED_MESSAGE =
  "Deze koppeling is nog niet ingesteld op de server.";

function providerNotConfigured(provider: string, missing: string[]) {
  console.warn(
    `[auth] provider "${provider}" has no credentials configured (missing: ${missing.join(", ") || "unknown"}) — refusing with provider_not_configured`,
  );
  return Response.json(
    { code: "provider_not_configured", provider, message: PROVIDER_NOT_CONFIGURED_MESSAGE },
    { status: 400, headers: { "cache-control": "no-store" } },
  );
}

/** Non-secret request facts for diagnosing cookie / state / host problems. */
function traceContext(request: Request, relativePath?: string) {
  const url = new URL(request.url);
  const cookieNames = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.split("=")[0]?.trim())
    .filter((n): n is string => typeof n === "string" && Boolean(n) && /auth|state|session/i.test(n));
  return {
    method: request.method,
    path: relativePath ?? url.pathname,
    hasCode: url.searchParams.has("code"),
    hasState: url.searchParams.has("state"),
    providerError: url.searchParams.get("error"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    betterAuthUrl: process.env["BETTER_AUTH_URL"] ?? process.env["NEXT_PUBLIC_APP_URL"] ?? null,
    authCookies: cookieNames, // names only, never values
  };
}

export async function handleAuthRequest({ request }: { request: Request }) {
  try {
    const { createRoutAuth, isProviderConfigured, missingProviderKeys, resolveAuthSecret } = await import("@/lib/better-auth.server");

    // A provider without credentials must never reach Better Auth: it would
    // throw and surface as a generic 500. Fail fast with a readable code so
    // one unconfigured provider cannot break the handler or other methods.
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const relativePath = pathname.startsWith("/api/auth")
      ? pathname.slice("/api/auth".length) || "/"
      : pathname;
    if (relativePath === "/change-email") return Response.json(
      { code: "passkey_email_change_required", message: "Wijzig je primaire e-mailadres via de beveiligde ROUT-accountpagina." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
    const { signInPathDecision, METHOD_DISABLED_MESSAGE, FIRST_FACTOR_PATHS } = await import("@/lib/auth/sign-in-policy");
    if (!signInPathDecision(relativePath).allow) {
      return json({ code: "method_disabled", message: METHOD_DISABLED_MESSAGE }, 410);
    }
    // Password, e-mail link and reset requests: fail-closed rate limit + bot check first.
    if (request.method === "POST" && FIRST_FACTOR_PATHS.has(relativePath)) {
      const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
      const { RATE_RULES, tooManyRequests } = await import("@/lib/rate-limit-rules");
      const limit = await hitRateLimit("auth", `${clientIp(request)}:${relativePath}`, RATE_RULES.authAttempt, { failClosed: true });
      if (!limit.ok) return tooManyRequests(limit.retryAfter);
      const { verifyAltcha } = await import("@/lib/altcha.server");
      const altcha = await verifyAltcha(request.headers.get("x-altcha"));
      if (!altcha.ok) return json({ code: "altcha_invalid", message: "Botcontrole mislukt. Probeer het opnieuw." }, 400);
    }
    const provider = (await providerFromBody(request, relativePath)) ?? providerFromPath(relativePath);
    // Zero-trust admin portal: social/OAuth sign-in is refused server-side.
    const { appMode, socialLoginAllowed } = await import("@/lib/app-mode");
    if (provider && !socialLoginAllowed(appMode())) {
      return Response.json(
        { code: "social_login_disabled", message: "Sociale logins zijn uitgeschakeld op het beheerportaal." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    if (provider && !isProviderConfigured(provider)) {
      return providerNotConfigured(provider, missingProviderKeys(provider));
    }

    // Configuration failures must precede mail, database-backed challenges and
    // passkeys. Never pretend that retrying a challenge can restore configuration.
    const { hasDatabase } = await import("@/lib/neon");
    const readiness = authConfigurationReadiness(hasDatabase(), Boolean(resolveAuthSecret()));
    if (!readiness.ready) return Response.json(
      { code: readiness.code, message: AUTH_UNAVAILABLE_TEXT.nl },
      { status: 503, headers: { "cache-control": "no-store" } },
    );

    if (provider === "gitlab" && SOCIAL_BODY_PATHS.has(relativePath)) {
      const { gitlabRedirectUri } = await import("@/lib/better-auth.server");
      console.info(`[auth] gitlab redirect_uri=${gitlabRedirectUri()}`);
    }

    const auth = createRoutAuth(request);
    const hasCookie = /better-auth|session/i.test(request.headers.get("cookie") ?? "");
    const needsSession = REGISTER_PATHS.has(relativePath) || relativePath === "/two-factor/disable";
    const live = hasCookie && needsSession ? await auth.api.getSession({ headers: request.headers }).catch(() => null) : null;
    const liveUser = (live as { user?: { id?: unknown } } | null)?.user;
    const sessionUserId = typeof liveUser?.id === "string" ? liveUser.id : null;
    // 2FA is mandatory for admins: they can switch it off only after losing the role.
    if (relativePath === "/two-factor/disable" && sessionUserId) {
      const { authUserIsAdmin } = await import("@/lib/auth/second-factor.server");
      if (await authUserIsAdmin(sessionUserId)) {
        const { ADMIN_TWO_FACTOR_REQUIRED } = await import("@/lib/auth/sign-in-policy");
        return json({ code: ADMIN_TWO_FACTOR_REQUIRED, message: "Voor beheerders is tweestapsverificatie verplicht en kan ze niet uit." }, 403);
      }
    }
    // First-passkey enrollment must run signed out, so the ticket/token decides the account.
    if (REGISTER_PATHS.has(relativePath) && sessionUserId && new URL(request.url).searchParams.get("context")) {
      return json({ code: "sign_out_first", message: "Meld je eerst af om een nieuw account of herstel te starten." }, 409);
    }

    // Recovery codes are stored hashed: hash the submitted code before Better Auth compares.
    if (request.method === "POST" && relativePath === "/two-factor/verify-backup-code") {
      const body = (await request.clone().json().catch(() => ({}))) as Record<string, unknown>;
      if (typeof body["code"] === "string") {
        const { resolveAuthSecret } = await import("@/lib/better-auth.server");
        const { hashBackupCode } = await import("@/lib/auth/backup-code-hash");
        const pepper = resolveAuthSecret()?.secret ?? "";
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        request = new Request(request.url, { method: "POST", headers, body: JSON.stringify({ ...body, code: await hashBackupCode(body["code"], pepper) }) });
      }
    }
    if (request.method === "POST" && relativePath === "/two-factor/view-backup-codes") {
      return Response.json({ code: "not_available", message: "Herstelcodes worden alleen gehasht bewaard." }, { status: 410 });
    }

    const res = await auth.handler(request);
    if (relativePath === "/passkey/generate-authenticate-options" && res.ok) {
      // Ensure the browser requests biometric/PIN verification; the verified hook also checks UV.
      const options = await res.json() as Record<string, unknown>;
      return Response.json({ ...options, userVerification: "required" }, { status: res.status, headers: res.headers });
    }
    if (res.status >= 400 && !/callback/.test(relativePath)) {
      // Better Auth reports most failures as an error response, not a throw:
      // log the exact payload server-side instead of only a bare status code.
      try {
        console.error("[BetterAuth Error]:", { status: res.status, ...traceContext(request, relativePath) });
      } catch {
        /* a body-read failure must never break the response */
      }
    }
    if (/callback/.test(relativePath)) {
      // Better Auth reports state/cookie problems as a redirect with ?error=.
      const loc = res.headers.get("location") ?? "";
      const errParam = loc ? new URL(loc, request.url).searchParams.get("error") : null;
      if (res.status >= 400 || errParam) {
        // Dubbele/verlopen callback (bv. dubbelklik bij de provider): als de
        // eerste poging de sessie al aanmaakte, stil doorsturen i.p.v. foutpagina.
        // Linking errors (account taken, e-mail mismatch) must reach the
        // settings page — never be swallowed as a "duplicate callback".
        const stale = !errParam || STALE_CALLBACK_ERRORS.has(errParam);
        if (stale) try {
          const session = await createRoutAuth(request).api.getSession({ headers: request.headers });
          if (session?.user) {
            console.info("[auth] duplicate OAuth callback ignored; session already active", { error: errParam, path: relativePath });
            return new Response(null, { status: 302, headers: { location: "/auth/continue", "cache-control": "no-store" } });
          }
        } catch {
          /* fall through to the normal error */
        }
        console.error("[auth] OAuth callback rejected:", { status: res.status, error: errParam, ...traceContext(request, relativePath) });
      }
    }
    return res;
  } catch (err) {
    logServerError("auth-handler", err);
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[auth] handler failed:", {
      name: err instanceof Error ? err.name : typeof err,
      ...traceContext(request),
    });
    const code = /interactive_transactions_unsupported|runtime_role_unsafe/.test(raw)
      ? "database_safety_blocked"
      : /PROVIDER_NOT_FOUND|provider[^\n]*(not found|not configured|not enabled|unknown provider)/i.test(raw)
      ? "provider_not_configured"
      : /SECRET/.test(raw)
        ? "missing_secret"
        : /DATABASE_URL/.test(raw)
          ? "missing_database"
          : /websocket|ECONN|ENOTFOUND|ETIMEDOUT|\bconnect\b|\bpool\b/i.test(raw)
            ? "db_connect"
            : /relation|column|does not exist/i.test(raw)
              ? "db_error"
              : "auth_error";
    if (code === "provider_not_configured") {
      console.warn("[auth] provider not configured (thrown by handler)");
    }
    const message = {
      database_safety_blocked: "Inloggen is tijdelijk niet beschikbaar: de veilige databaseverbinding is nog niet gereed.",
      missing_secret: "Inloggen is niet ingesteld: BETTER_AUTH_SECRET ontbreekt op de server.",
      missing_database: "Inloggen is niet ingesteld: DATABASE_URL ontbreekt op de server.",
      db_connect: "De database is niet bereikbaar vanaf de server. Probeer later opnieuw.",
      db_error: "Inloggen faalt door een databaseprobleem (tabellen). Probeer later opnieuw.",
      auth_error: "Inloggen faalt aan serverzijde. Probeer later opnieuw.",
      provider_not_configured: PROVIDER_NOT_CONFIGURED_MESSAGE,
    }[code];
    const status = code === "provider_not_configured" ? 400 : code === "database_safety_blocked" ? 503 : 500;
    return Response.json({ code, message }, { status, headers: { "cache-control": "no-store" } });
  }
}

export const Route = createFileRoute("/api_/auth/$")({
  server: {
    handlers: {
      GET: handleAuthRequest,
      POST: handleAuthRequest,
    },
  },
});
