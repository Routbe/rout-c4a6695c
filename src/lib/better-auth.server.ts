import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { magicLink } from "better-auth/plugins/magic-link";
import { magicLinkTwoFactor } from "@/lib/auth/magic-link-two-factor";
import { symmetricDecrypt } from "better-auth/crypto";
import { hashedBackupCodeStore } from "@/lib/auth/backup-code-hash";
import { passkey } from "@better-auth/passkey";
import { GatewayPool, databaseTransport, hasDatabase } from "@/lib/neon";
import { betterAuthDatabase } from "@/lib/neon-kysely.server";
import { APP_DOMAINS } from "@/lib/app-domains";
import { canonicalAppUrl, isApprovedHost } from "@/lib/app-url";
import { EXPLICIT_ACCOUNT_LINKING } from "@/lib/identity/link-rules";
import { AUTH_COOKIE_ATTRIBUTES, configuredAuthOrigin , chooseAuthBaseUrl } from "@/lib/auth-origin";
import { logServerError } from "@/lib/security/safe-errors";
import { fediverseSession } from "@/lib/auth/fediverse-session";

/**
 * Self-hosted Better Auth — ROUT's own identity layer (System A).
 *
 * Sign-in: passkey (WebAuthn/FIDO2), one-time e-mail link or e-mail + password.
 * With 2FA switched on, password and e-mail-link sign-ins need a second step
 * (authenticator app, SMS, recovery code or passkey); admins must have 2FA on.
 * Configured social providers also sign in existing members on the public portal.
 * New accounts still require the consent/age/passkey registration flow.
 * Data lives in the `neon_auth` schema.
 *
 * Providers are only enabled when their credentials are present, so a missing
 * key disables that button instead of crashing sign-in.
 *
 * Cookies: strictly functional (session + OAuth state/CSRF), always
 * HttpOnly + Secure + SameSite=Lax. No trackers, no third-party cookies.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** Alternative names people commonly use on Vercel (Auth.js style). */
const ALIASES: Record<string, string[]> = {
  GOOGLE_CLIENT_ID: ["GOOGLE_OAUTH_CLIENT_ID", "AUTH_GOOGLE_ID", "GOOGLE_ID"],
  GOOGLE_CLIENT_SECRET: ["GOOGLE_OAUTH_CLIENT_SECRET", "AUTH_GOOGLE_SECRET", "GOOGLE_SECRET"],
  GITHUB_CLIENT_ID: ["GITHUB_OAUTH_CLIENT_ID", "AUTH_GITHUB_ID", "GITHUB_ID"],
  GITHUB_CLIENT_SECRET: ["GITHUB_OAUTH_CLIENT_SECRET", "AUTH_GITHUB_SECRET", "GITHUB_SECRET"],
  GITLAB_CLIENT_ID: ["GITLAB_OAUTH_CLIENT_ID", "AUTH_GITLAB_ID", "GITLAB_ID"],
  GITLAB_CLIENT_SECRET: ["GITLAB_OAUTH_CLIENT_SECRET", "AUTH_GITLAB_SECRET", "GITLAB_SECRET"],
  APPLE_CLIENT_ID: ["APPLE_OAUTH_CLIENT_ID", "AUTH_APPLE_ID", "APPLE_ID"],
  APPLE_CLIENT_SECRET: ["APPLE_OAUTH_CLIENT_SECRET", "AUTH_APPLE_SECRET", "APPLE_SECRET"],
  BETTER_AUTH_SECRET: ["AUTH_SECRET"],
};

function envAny(name: string): string | undefined {
  return env(name) ?? (ALIASES[name] ?? []).map(env).find(Boolean);
}

/**
 * Better Auth requires a dedicated signing secret, never database credentials.
 */
export function resolveAuthSecret(): { secret: string; derived: boolean } | null {
  const direct = envAny("BETTER_AUTH_SECRET");
  if (direct && direct.length >= 32) return { secret: direct, derived: false };
  return null;
}

function pair(id: string, secret: string) {
  const clientId = envAny(id);
  const clientSecret = envAny(secret);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** First-party publieke PKCE-client voor de native "ROUT ID"-login (db/78). */
export const NATIVE_OIDC_CLIENT_ID = "rout_native_self";

/** oidc is geconfigureerd als álle OIDC_* er zijn, of géén enkele (native fallback). */
function oidcConfigured(): boolean {
  const keys = ["OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_DISCOVERY_URL"];
  const present = keys.filter((k) => Boolean(envAny(k)));
  return present.length === 0 || present.length === keys.length;
}

/** Origin the browser is actually using (proxy-aware: x-forwarded-host/proto). */
function requestOrigin(request?: Request): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host") || new URL(request.url).host;
  if (!host) return null;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const fwdProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto = fwdProto === "http" || fwdProto === "https" ? fwdProto : local ? "http" : "https";
  // Behind Vercel's proxy the hop may report http; a non-local host is always https.
  return `${local ? proto : "https"}://${host}`;
}

/** The base URL OAuth callbacks are built on: the approved request host first, else configured, else canonical. */
function baseUrlFor(request?: Request): string {
  const origin = requestOrigin(request);
  return chooseAuthBaseUrl(origin, Boolean(origin && isApprovedHost(new URL(origin).host)), configuredAuthOrigin(process.env), canonicalAppUrl());
}

export { baseUrlFor as authBaseUrlFor };

/** Canonical https origin (no trailing slash) the OAuth providers are registered on. */
export function canonicalAuthOrigin(): string {
  const raw = (configuredAuthOrigin(process.env) ?? canonicalAppUrl()).trim();
  const base = raw.replace(/\/+$/, "").replace(/\/api\/auth$/, "");
  const url = new URL(/^https?:\/\//.test(base) ? base : `https://${base}`);
  const local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  return `${local ? url.protocol.replace(":", "") : "https"}://${url.host}`;
}

/** Exact GitLab redirect_uri: GITLAB_REDIRECT_URI override, else <canonical>/api/auth/callback/gitlab. */
export function gitlabRedirectUri(): string {
  const override = env("GITLAB_REDIRECT_URI")?.trim().replace(/\/+$/, "");
  if (override) return override.replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, "https://");
  return `${canonicalAuthOrigin()}/api/auth/callback/gitlab`;
}

function gitlabIssuer(): string {
  return (env("GITLAB_ISSUER")?.trim() || "https://gitlab.com").replace(/\/+$/, "");
}

/** On the admin portal, sign-in mails go only to admin addresses (silently, no enumeration). */
async function mayReceiveSignInMail(email: string): Promise<boolean> {
  const { isAdminMode } = await import("@/lib/app-mode");
  if (!isAdminMode()) return true;
  const { canUseAdminEmail } = await import("@/lib/auth/owner-admin.server");
  return canUseAdminEmail(email);
}

/** Ties the anonymous tour draft to this e-mail, so the link finds it on any device. */
async function linkTourDraft(request: Request | undefined, email: string) {
  try {
    const raw = (request?.headers.get("cookie") ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith("rout_tour_draft="));
    const token = raw ? decodeURIComponent(raw.slice("rout_tour_draft=".length)) : "";
    if (token.length < 8) return;
    const { readTourDraftByToken, upsertTourDraft } = await import("@/lib/tour-draft.server");
    const draft = await readTourDraftByToken(token);
    if (draft) await upsertTourDraft(email, draft);
  } catch (err) {
    logServerError("auth-draft-link", err);
  }
}

export function createRoutAuth(request?: Request) {
  // Both transports share the same guarded adapter, including auth and ALTCHA.
  if (!hasDatabase()) {
    console.error("[auth] no runtime database configured.");
    throw new Error("DATABASE_URL ontbreekt: geen databaseverbinding ingesteld.");
  }
  const resolved = resolveAuthSecret();
  if (!resolved) throw new Error("BETTER_AUTH_SECRET ontbreekt.");
  const secret = resolved.secret;

  const socialProviders: Record<string, unknown> = {};
  const google = pair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  if (google) socialProviders["google"] = { ...google, prompt: "select_account", disableSignUp: true };
  const github = pair("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET");
  if (github) socialProviders["github"] = { ...github, disableSignUp: true };
  const gitlab = pair("GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET");
  if (gitlab) {
    // Pinned so GitLab (Group Application) always sees the exact registered URI,
    // whatever host the visitor used. read_user is added by Better Auth itself.
    socialProviders["gitlab"] = {
      ...gitlab,
      disableSignUp: true,
      issuer: gitlabIssuer(),
      redirectURI: gitlabRedirectUri(),
      scope: ["openid", "profile", "email"],
    };
  }
  const apple = pair("APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET");
  if (apple) socialProviders["apple"] = { ...apple, disableSignUp: true, appBundleIdentifier: env("APPLE_APP_BUNDLE_IDENTIFIER") };

  // Explicit linking remains unchanged; public sign-in cannot create accounts implicitly.
  const plugins: unknown[] = [
    fediverseSession(),
    magicLink({
      expiresIn: 60 * 15,
      // New accounts only through the passkey sign-up (consent + age checks).
      disableSignUp: true,
      sendMagicLink: async ({ email, url }: { email: string; url: string }) => {
        if (!(await mayReceiveSignInMail(email))) return;
        await linkTourDraft(request, email);
        const { sendLocalizedEmail, localeFromRequest } = await import("@/lib/email.server");
        const { issueLoginCode } = await import("@/lib/login-code.server");
        const code = await issueLoginCode(email, url);
        await sendLocalizedEmail({ to: email, intent: "magic-link", locale: localeFromRequest(request), payload: { link: url, code: code ?? undefined } });
      },
    }),
  ];

  const genericConfigs: unknown[] = [];
  // "ROUT ID" (voorheen Keycloak): zonder externe OIDC_*-configuratie valt deze
  // provider terug op onze EIGEN sovereign OIDC-provider (publieke PKCE-client
  // `rout_native_self`, geen externe sleutels nodig). Met OIDC_* ingesteld
  // wijst hij naar die externe Keycloak-compatible provider.
  const oidc = pair("OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET");
  const discoveryUrl = env("OIDC_DISCOVERY_URL");
  if (oidc && discoveryUrl) {
    genericConfigs.push({ providerId: "oidc", discoveryUrl, ...oidc, scopes: ["openid", "email", "profile"], pkce: true, disableSignUp: true });
  } else if (!oidc && !discoveryUrl) {
    // Discover on the live (approved) request host so dev/preview never call a dead port.
    const live = requestOrigin(request);
    const issuerBase = baseUrlFor(request);
    genericConfigs.push({
      providerId: "oidc",
      disableSignUp: true,
      discoveryUrl: `${issuerBase}/.well-known/openid-configuration`,
      clientId: NATIVE_OIDC_CLIENT_ID,
      scopes: ["openid", "email", "profile"],
      pkce: true,
    });
  }

  // Infomaniak (Zwitserland) — native OIDC, geen tussenpartij.
  const infomaniak = pair("INFOMANIAK_CLIENT_ID", "INFOMANIAK_CLIENT_SECRET");
  if (infomaniak) {
    genericConfigs.push({
      providerId: "infomaniak",
      disableSignUp: true,
      ...infomaniak,
      authorizationUrl: "https://login.infomaniak.com/authorize",
      tokenUrl: "https://login.infomaniak.com/token",
      userInfoUrl: "https://login.infomaniak.com/oauth2/userinfo",
      scopes: ["openid", "email", "profile"],
      pkce: true,
      // Identity comes only from Infomaniak's userinfo endpoint (server-to-server,
      // authenticated with the access token). The id_token is never decoded here:
      // its signature is not verified, so its claims cannot be trusted.
      getUserInfo: async (tokens: { idToken?: string; accessToken?: string }) => {
        if (!tokens.accessToken) return null;
        let p: Record<string, unknown>;
        try {
          const r = await fetch("https://login.infomaniak.com/oauth2/userinfo", {
            headers: { authorization: `Bearer ${tokens.accessToken}` },
          });
          if (!r.ok) return null;
          p = (await r.json()) as Record<string, unknown>;
        } catch {
          return null;
        }
        const id = p["sub"] ?? p["id"];
        if (!id || typeof p["email"] !== "string") return null;
        return {
          id: String(id),
          email: (p["email"] as string).toLowerCase(),
          name: (p["name"] as string) ?? (p["display_name"] as string) ?? undefined,
          image: (p["picture"] as string) ?? undefined,
          emailVerified: p["email_verified"] === true,
        };
      },
      mapProfileToUser: (p: Record<string, unknown>) => ({
        email: typeof p["email"] === "string" ? (p["email"] as string).toLowerCase() : undefined,
        name: (p["name"] as string) ?? (p["display_name"] as string) ?? undefined,
        image: (p["picture"] as string) ?? undefined,
        // Alleen expliciet bevestigde adressen gelden als geverifieerd.
        emailVerified: p["email_verified"] === true,
      }),
    });
  }
  if (genericConfigs.length) plugins.push(genericOAuth({ config: genericConfigs as never }));

  const origin = baseUrlFor(request);

  // Second step: authenticator app (TOTP), SMS code (verified number only) or recovery code.
  // E-mail is never a second factor: the e-mail link is already a first factor.
  plugins.push(
    twoFactor({
      issuer: "ROUT",
      allowPasswordless: true,
      otpOptions: {
        digits: 6,
        period: 5,
        storeOTP: "hashed",
        allowedAttempts: 5,
        sendOTP: async ({ user, otp }: { user: { id: string }; otp: string }) => {
          const { sendSecondFactorSms } = await import("@/lib/auth/second-factor.server");
          if (!(await sendSecondFactorSms(user.id, otp))) console.warn("[2fa] no verified phone or SMS provider; code not sent");
        },
      },
      // 10 one-time recovery codes, stored only as peppered PBKDF2 hashes.
      backupCodeOptions: {
        amount: 10,
        length: 10,
        storeBackupCodes: hashedBackupCodeStore(secret, (data) => symmetricDecrypt({ key: secret, data })),
      },
      schema: { twoFactor: { modelName: "neon_auth.twoFactor" } },
    } as never),
    magicLinkTwoFactor({
      describe: async (authUserId) => (await import("@/lib/auth/second-factor.server")).secondFactorFacts(authUserId),
    }),
    passkey({
      rpID: new URL(origin ?? canonicalAppUrl()).hostname,
      rpName: "ROUT",
      origin: origin ?? canonicalAppUrl(),
      schema: { passkey: { modelName: "neon_auth.passkey" } },
      // Discoverable credential + mandatory biometric/PIN: phishing-resistant, no username needed.
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      registration: {
        // First passkey without a session only with a signed sign-up ticket or an
        // admin-approved recovery token (passkey-enrollment.server.ts).
        requireSession: false,
        resolveUser: async ({ context }: { context?: string | null }) => {
          const { resolveEnrollment } = await import("@/lib/auth/passkey-enrollment.server");
          return resolveEnrollment(secret, context);
        },
        afterVerification: async ({ ctx, context }: { ctx: { context: { internalAdapter: never } }; context?: string | null }) => {
          const { finalizeEnrollment } = await import("@/lib/auth/passkey-enrollment.server");
          return finalizeEnrollment(secret, ctx.context.internalAdapter, context);
        },
      },
      authentication: {
        afterVerification: async ({ verification, clientData, ctx }: { verification: { authenticationInfo: { userVerified: boolean } }; clientData: { id: string }; ctx: { setCookie: (name: string, value: string, attributes: { httpOnly: boolean; secure: boolean; sameSite: "strict"; path: string; maxAge: number }) => void } }) => {
          // A fresh password/email session is never evidence of biometric verification.
          if (!verification.authenticationInfo.userVerified) return;
          const { sql } = await import("@/lib/neon");
          const rows = await sql`select u.id from public.users u join neon_auth.passkey p
            on p."userId"::text = coalesce(u.auth_user_id::text, u.user_metadata->>'neon_auth_id')
            where p."credentialID" = ${clientData.id} limit 1`;
          const userId = rows[0]?.["id"];
          if (typeof userId !== "string") return;
          const { grantStepUp } = await import("@/lib/auth/step-up.server");
          await grantStepUp(userId, "passkey", (name, value) => ctx.setCookie(name, value, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 120 }));
        },
      },
    } as never),
  );

  return betterAuth({
    appName: "ROUT",
    baseURL: baseUrlFor(request),
    basePath: "/api/auth",
    secret,
    database: betterAuthDatabase() as never,
    user: { modelName: "neon_auth.user" },
    session: {
      modelName: "neon_auth.session",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    account: {
      modelName: "neon_auth.account",
      accountLinking: EXPLICIT_ACCOUNT_LINKING,
    },
    verification: { modelName: "neon_auth.verification" },
    databaseHooks: {
      session: {
        create: {
          after: async (session: { id: string; userId?: string; userAgent?: string | null }) => {
            if (!session.userId) return;
            const { sql } = await import("@/lib/neon");
            const rows = await sql`select id from public.users where auth_user_id::text=${session.userId} or user_metadata->>'neon_auth_id'=${session.userId} limit 1`;
            const id = rows[0]?.["id"];
            if (typeof id === "string") {
              const { appendEncryptedUserEvent } = await import("@/lib/ledger/ledger.server");
              await appendEncryptedUserEvent(id, { event_type: "sign_in", timestamp: new Date().toISOString() });
            }
            const { later, notifyNewSignIn } = await import("./site-mail.server");
            later(() => notifyNewSignIn(session.userId as string, session.id, session.userAgent ?? null));
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // New accounts only through the passkey sign-up (consent + age checks).
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 30,
      // A reset (or first password) signs out every other device.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
        if (!(await mayReceiveSignInMail(user.email))) return;
        const { sendLocalizedEmail, localeFromRequest } = await import("@/lib/email.server");
        await sendLocalizedEmail({ to: user.email, intent: "password-reset", locale: localeFromRequest(request), payload: { link: url, name: user.name ?? undefined } });
      },
    },
    socialProviders: socialProviders as never,
    plugins: plugins as never,
    trustedOrigins: [
      canonicalAppUrl(),
      // Both schemes, apex + wildcards: logins must work on https://rout.be
      // (bare apex, no www) AND http://rout.be without an origin mismatch.
      ...APP_DOMAINS.flatMap((d) => [`https://${d}`, `https://*.${d}`, `http://${d}`, `http://*.${d}`]),
      "http://localhost:8080",
      "http://localhost:*",
      "http://127.0.0.1:*",
      "https://*.lovableproject.com",
      "https://*.lovable.app",
      // Both split deployments (rout.be public, rout.dlp.li admin) + configured base.
      "https://rout.dlp.li",
      "https://www.rout.be",
      ...[configuredAuthOrigin(process.env)].flatMap((u) => {
        try {
          return u ? [new URL(/^https?:\/\//.test(u.trim()) ? u.trim() : `https://${u.trim()}`).origin] : [];
        } catch {
          return [];
        }
      }),
      ...(origin && isApprovedHost(new URL(origin).host) ? [origin] : []),
    ],
    advanced: {
      // Always secure: production is https behind Vercel's proxy even when the
      // internal hop says http; browsers accept secure cookies on localhost.
      useSecureCookies: true,
      // lax lets the top-level OAuth redirect back carry the state cookie.
      defaultCookieAttributes: AUTH_COOKIE_ATTRIBUTES,
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"] },
      database: { generateId: () => crypto.randomUUID() },
    },
    telemetry: { enabled: false },
  });
}

/** Which sign-in buttons are actually configured (for the UI). */
export function enabledProviders(): string[] {
  const list: string[] = [];
  if (pair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")) list.push("google");
  if (pair("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET")) list.push("github");
  if (pair("GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET")) list.push("gitlab");
  if (pair("APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET")) list.push("apple");
  if (oidcConfigured()) list.push("oidc");
  if (pair("INFOMANIAK_CLIENT_ID", "INFOMANIAK_CLIENT_SECRET")) list.push("infomaniak");
  return list;
}

const PROVIDER_KEYS: Record<string, string[]> = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  gitlab: ["GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET"],
  apple: ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET"],
  oidc: ["OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_DISCOVERY_URL"],
  infomaniak: ["INFOMANIAK_CLIENT_ID", "INFOMANIAK_CLIENT_SECRET"],
};

/** Is a sign-in provider fully configured? Names only — never values. */
export function isProviderConfigured(id: string): boolean {
  if (id === "oidc") return oidcConfigured();
  const keys = PROVIDER_KEYS[id];
  if (!keys) return false;
  return keys.every((k) => Boolean(envAny(k)));
}

/** Key NAMES a provider still misses — safe for logs and diagnostics. */
export function missingProviderKeys(id: string): string[] {
  if (id === "oidc") return oidcConfigured() ? [] : PROVIDER_KEYS["oidc"]!.filter((k) => !envAny(k));
  const keys = PROVIDER_KEYS[id];
  return keys ? keys.filter((k) => !envAny(k)) : ["*"];
}

/** Live checks for the deploy: each sign-in table, with SQLSTATE codes only (never values). */
export async function liveAuthChecks() {
  const step = async (query: string) => {
    try {
      await new GatewayPool().query(query);
      return { ok: true as const, code: null };
    } catch (e) {
      const { code, status } = (e ?? {}) as { code?: unknown; status?: unknown };
      if (typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)) return { ok: false as const, code };
      return { ok: false as const, code: typeof status === "number" ? `http_${status}` : "unknown" };
    }
  };
  const checks = hasDatabase()
    ? {
        authVerification: await step("select 1 from neon_auth.verification limit 1"),
        authSession: await step('select 1 from neon_auth.session limit 1'),
        securityCheckStore: await step("select 1 from public.altcha_used limit 1"),
        members: await step("select 1 from public.users limit 1"),
      }
    : null;
  const database = Boolean(checks && Object.values(checks).every((c) => c.ok));
  return {
    database,
    databaseError: checks ? (Object.entries(checks).filter(([, c]) => !c.ok).map(([k, c]) => `${k}:${c.code}`).join(",") || null) : "no_database_configured",
    checks,
    databaseTransport: databaseTransport(),
    emailService: Boolean(env("BREVO_API_KEY")),
  };
}

/** Diagnostic report — names only, never values. */
export function authDiagnostics(request?: Request) {
  const base = baseUrlFor(request);
  const resolved = resolveAuthSecret();
  const core = {
    DATABASE_URL: Boolean(env("DATABASE_URL")),
    DATABASE_CONNECTION: hasDatabase(),
    BETTER_AUTH_SECRET: Boolean(resolved),
    BETTER_AUTH_URL: Boolean(configuredAuthOrigin(process.env)),
  };
  const providers = Object.entries(PROVIDER_KEYS).map(([id, keys]) => {
    const missing = keys.filter((k) => !envAny(k));
    const generic = id === "oidc" || id === "infomaniak";
    return {
      id,
      configured: missing.length === 0,
      missing,
      callbackUrl: `${base}/api/auth/${generic ? "oauth2/callback" : "callback"}/${id}`,
    };
  });
  return { baseUrl: base, secretDerived: resolved?.derived ?? false, core, coreReady: core.DATABASE_CONNECTION && core.BETTER_AUTH_SECRET && core.BETTER_AUTH_URL, providers };
}
