import { requireDeveloperAccess } from "@/lib/auth/developer-access";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cleanRedirectUri } from "./redirect-match";
import { optionalAuth, requireAuth } from "@/lib/auth/middleware";
import { needsStepUp, shareRichIdentity, STRICT_ACR } from "./step-up";
import { clientSchema, settingsSchema, testUserSchema, verificationRequestSchema } from "./console-schemas";

/**
 * Server functions for the ROUT Developer Console and the consent screen.
 *
 * Console (developer role): every function checks the session + verified
 * developer status itself and only touches the caller's own apps. Client
 * secrets leave the server once: on create or rotate.
 *
 * Consent screen (consumer role): separate from the console; uses only the
 * end user's normal ROUT session.
 */

async function assertVerified(userId: string) {
  const { isVerifiedDeveloper } = await import("./provider.server");
  if (!(await isVerifiedDeveloper(userId))) {
    throw new Error("De Developer Console is beschikbaar voor geverifieerde leden.");
  }
}

/** Turns provider OAuthErrors into plain messages for the console UI. */
async function friendly<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const { OAuthError } = await import("./provider.server");
    if (error instanceof OAuthError) throw new Error(error.message);
    throw error;
  }
}

const idSchema = z.object({ id: z.string().uuid() }).strict();

export const consoleAccess = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAccess])
  .handler(async ({ context }) => {
    const { isVerifiedDeveloper } = await import("./provider.server");
    return { verified: await isVerifiedDeveloper(context.userId) };
  });

export const listOAuthDebugEvents = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), errorsOnly: z.boolean().optional() }).strict().parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { listClients } = await import("./provider.server");
    const app = (await listClients(context.userId, context.activeWorkspaceId ?? null)).find((c) => c.id === data.id);
    if (!app) throw new Error("Deze app bestaat niet (meer).");
    const { listDebugEvents } = await import("./debug-events.server");
    return listDebugEvents(app.clientId, Boolean(data.errorsOnly));
  });

export const listMyApiActivity = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAccess])
  .handler(async ({ context }) => {
    await assertVerified(context.userId);
    const { listClients } = await import("./provider.server");
    const apps = await listClients(context.userId, context.activeWorkspaceId ?? null);
    const { listDebugEventsForClients } = await import("./debug-events.server");
    const names = new Map(apps.map((a) => [a.clientId, a.name]));
    const events = await listDebugEventsForClients(apps.map((a) => a.clientId));
    return events.map((e) => ({ ...e, appName: names.get(e.clientId) ?? e.clientId }));
  });

export const listOAuthClients = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAccess])
  .handler(async ({ context }) => {
    await assertVerified(context.userId);
    const { listClients } = await import("./provider.server");
    return listClients(context.userId, context.activeWorkspaceId ?? null);
  });

export const saveOAuthClient = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => clientSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { createClient, updateClient } = await import("./provider.server");
    const input = {
      name: data.name,
      description: data.description ?? null,
      logoUrl: data.logoUrl ?? null,
      homepageUrl: data.homepageUrl ?? null,
      privacyUrl: data.privacyUrl ?? null,
      termsUrl: data.termsUrl ?? null,
      redirectUris: data.redirectUris,
      ...(data.postLogoutRedirectUris ? { postLogoutRedirectUris: data.postLogoutRedirectUris } : {}),
      scopes: data.scopes,
      ...(data.flowPreference ? { flowPreference: data.flowPreference } : {}),
      ...(data.richIdentityEnabled !== undefined ? { richIdentityEnabled: data.richIdentityEnabled } : {}),
      ...(data.handleSyncEnabled !== undefined ? { handleSyncEnabled: data.handleSyncEnabled } : {}),
    };
    return friendly(async () => {
      if (data.id) {
        return { client: await updateClient({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id, input), clientSecret: null };
      }
      const { ensureStepUpSession } = await import("@/lib/auth/step-up.server");
      await ensureStepUpSession(context.userId, "oauth_secret");
      const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
      const { RATE_RULES } = await import("@/lib/rate-limit-rules");
      const limit = await hitRateLimit("app-create", context.userId, RATE_RULES.appCreate);
      if (!limit.ok) throw new Error("Je hebt het maximum aantal nieuwe apps per uur bereikt. Probeer later opnieuw.");
      const created = await createClient(context.userId, input, context.activeWorkspaceId ?? null);
      const { later, recipient, sendSiteMail, siteOrigin } = await import("@/lib/site-mail.server");
      later(async () => {
        const r = await recipient(context.userId);
        const { appCreatedMail } = await import("@/emails/site-mails");
        await sendSiteMail(r.email, appCreatedMail({ lang: r.lang, name: r.name, app: created.client.name, clientId: created.client.clientId, consoleUrl: `${siteOrigin()}/developers` }), ["console", "app-created"]);
      });
      return created;
    });
  });

export const saveOAuthClientSettings = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { updateClientSettings } = await import("./provider.server");
    const { id, ...rest } = data;
    const settings = {
      ...rest,
      ...(rest.supportEmail !== undefined ? { supportEmail: rest.supportEmail?.toLowerCase() || null } : {}),
      ...(rest.dpoEmail !== undefined ? { dpoEmail: rest.dpoEmail?.toLowerCase() || null } : {}),
      ...(rest.legalOwner !== undefined ? { legalOwner: rest.legalOwner || null } : {}),
    };
    return friendly(() => updateClientSettings({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, id, settings));
  });

export const deleteOAuthClient = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { deleteClient } = await import("./provider.server");
    await deleteClient({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id);
    return { ok: true };
  });

/**
 * One-way pairwise opt-in for legacy apps (Cluster C). Existing users get a new
 * uncorrelatable `sub`; the switch is irreversible and needs a fresh step-up.
 */
export const upgradeOAuthClientToPairwise = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { ensureStepUpSession } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "oauth_subject_type");
    const { upgradeClientToPairwise } = await import("./provider.server");
    const client = await friendly(async () => upgradeClientToPairwise({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id));
    return { ok: true as const, subjectType: client.subjectType };
  });

export const rotateOAuthSecret = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { ensureStepUpSession } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "oauth_secret");
    const { rotateClientSecret } = await import("./provider.server");
    return friendly(async () => {
      const clientSecret = await rotateClientSecret({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id);
      const { later, recipient, sendSiteMail, siteOrigin } = await import("@/lib/site-mail.server");
      later(async () => {
        const { sql } = await import("@/lib/neon");
        const rows = (await sql`select name from public.oauth_clients where id = ${data.id} limit 1`) as Record<string, unknown>[];
        const r = await recipient(context.userId);
        const { secretRotatedMail } = await import("@/emails/site-mails");
        await sendSiteMail(r.email, secretRotatedMail({ lang: r.lang, name: r.name, app: String(rows[0]?.["name"] ?? "je app"), consoleUrl: `${siteOrigin()}/developers` }), ["console", "secret-rotated"]);
      });
      return { clientSecret };
    });
  });

/** Back-channel email sync webhook (https only, no internal hosts). Returns the signing secret once. */
export const setOAuthBackchannelWebhook = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), url: z.string().url().max(2048).nullable() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { manageableClientId } = await import("./provider.server");
    const clientId = await friendly(() => manageableClientId({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id));
    const { setBackchannelWebhook } = await import("@/lib/auth/email-sync-webhook.server");
    return setBackchannelWebhook(clientId, data.url);
  });

export const getOAuthClientInsights = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { clientInsights, latestVerification } = await import("./provider.server");
    return friendly(async () => ({
      ...(await clientInsights({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id)),
      verification: await latestVerification({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id),
    }));
  });

export const listOAuthTestUsers = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { listTestUsers } = await import("./provider.server");
    return friendly(() => listTestUsers({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id));
  });

export const addOAuthTestUser = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => testUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { addTestUser } = await import("./provider.server");
    await friendly(() => addTestUser({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id, data.identifier));
    return { ok: true };
  });

export const removeOAuthTestUser = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => testUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { removeTestUser } = await import("./provider.server");
    await friendly(() => removeTestUser({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id, data.identifier));
    return { ok: true };
  });

export const requestOAuthVerification = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) => verificationRequestSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerified(context.userId);
    const { requestVerification } = await import("./provider.server");
    await friendly(() => requestVerification({ userId: context.userId, workspaceId: context.activeWorkspaceId ?? null }, data.id, data.note ?? ""));
    const { later, sendSiteMail, siteOrigin } = await import("@/lib/site-mail.server");
    later(async () => {
      const { sql } = await import("@/lib/neon");
      const rows = (await sql`select name, client_id from public.oauth_clients where id = ${data.id} limit 1`) as Record<string, unknown>[];
      const app = String(rows[0]?.["name"] ?? "onbekende app");
      const clientId = String(rows[0]?.["client_id"] ?? "");
      const adminEmail = process.env["ADMIN_EMAIL"] ?? process.env["BREVO_ADMIN_EMAIL"] ?? null;
      const { verificationRequestedMail } = await import("@/emails/site-mails");
      const { mailLang } = await import("@/emails/verification-mails");
      await sendSiteMail(adminEmail, verificationRequestedMail({ lang: mailLang("nl"), app, clientId, note: data.note ?? "", reviewUrl: `${siteOrigin()}/admin` }), ["console", "verification-requested"]);
    });
    return { ok: true };
  });

/* ------------------------------------------------------ admin review ---- */

export const listAppVerificationRequests = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAccess])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("@/lib/admin.server");
    await assertAdminRole(context.userId);
    const { listPendingVerifications } = await import("./provider.server");
    return listPendingVerifications();
  });

export const reviewAppVerificationRequest = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data: unknown) =>
    z.object({ requestId: z.string().uuid(), approve: z.boolean() }).strict().parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("@/lib/admin.server");
    await assertAdminRole(context.userId);
    const { reviewVerification } = await import("./provider.server");
    await reviewVerification(context.userId, data.requestId, data.approve);
    const { later, recipient, sendSiteMail, siteOrigin } = await import("@/lib/site-mail.server");
    later(async () => {
      const { sql } = await import("@/lib/neon");
      const rows = (await sql`select c.name, c.owner_user_id from public.oauth_client_verification_requests v
        join public.oauth_clients c on c.client_id = v.client_id where v.id = ${data.requestId} limit 1`) as Record<string, unknown>[];
      const owner = rows[0]?.["owner_user_id"];
      if (typeof owner !== "string") return;
      const r = await recipient(owner);
      const { appReviewMail } = await import("@/emails/site-mails");
      await sendSiteMail(r.email, appReviewMail({ lang: r.lang, name: r.name, app: String(rows[0]?.["name"] ?? "je app"), approved: data.approve, consoleUrl: `${siteOrigin()}/developers` }), ["console", "app-review"]);
    });
    return { ok: true };
  });

/* ------------------------------------------------------ consent screen --- */

const authorizeSchema = z.object({
  clientId: z.string().min(4).max(120),
  // Keycloak/brokers sturen lange, soms dubbel-geëncodeerde URI's: opschonen vóór alles.
  redirectUri: z.string().min(4).max(2000).transform((v) => cleanRedirectUri(v)),
  scope: z.string().max(200).optional(),
  state: z.string().max(300).nullable().optional(),
  nonce: z.string().max(300).nullable().optional(),
  /** Empty = no PKCE (only allowed when the app turned PKCE off). */
  codeChallenge: z.string().max(200),
  codeChallengeMethod: z.string().max(10),
  prompt: z.string().max(60).nullable().optional(),
  maxAge: z.string().max(12).nullable().optional(),
  acrValues: z.string().max(200).nullable().optional(),
  loginHint: z.string().max(200).nullable().optional(),
});
type AuthorizeInput = z.infer<typeof authorizeSchema>;

export type AuthorizeDebug = { code: string; expected: string[]; received: string };

export type AuthorizePrompt = {
  ok: boolean;
  error?: string;
  /** Developer-facing details, shown behind a toggle on the error screen. */
  debug?: AuthorizeDebug;
  /** Standard OIDC error redirect back to the app (only when the redirect URI is trusted). */
  redirectTo?: string;
  app?: {
    name: string;
    logoUrl: string | null;
    homepageUrl: string | null;
    privacyUrl: string | null;
    termsUrl: string | null;
    verified?: boolean;
  };
  scopes?: string[];
  account?: { email: string; name: string | null; handle: string | null; avatarUrl: string | null };
  /** E-mail choices for this app (only when the email scope is asked). */
  emailOptions?: { id: string; source: "primary" | "alias" | "relay"; email: string }[];
  emailChoice?: string;
  /** Sign-in providers linked to this ROUT account (Google, Apple, …) — names only. */
  linkedProviders?: string[];
  alreadyGranted?: boolean;
  /** Scopes already granted earlier (incremental consent shows only the rest). */
  grantedScopes?: string[];
  /** Strict flow / prompt=login / max_age / acr_values → extra code required. */
  requiresStepUp?: boolean;
  trustedKycPartner?: boolean;
  /** App asks (optionally) for public activity. */
  richIdentity?: boolean;
};

async function profileOf(userId: string) {
  const { sql } = await import("@/lib/neon");
  try {
    const rows = (await sql`select username, avatar_url from public.profiles
      where user_id = ${userId} or id = ${userId} limit 1`) as Record<string, unknown>[];
    return {
      handle: (rows[0]?.["username"] as string | null) ?? null,
      avatarUrl: (rows[0]?.["avatar_url"] as string | null) ?? null,
    };
  } catch {
    return { handle: null, avatarUrl: null };
  }
}

/**
 * Shared checks for every authorize step. Fails safe: with an unknown app or
 * wrong redirect URI we never send the user back to the app.
 */
async function checkRequest(data: AuthorizeInput) {
  const { getClientByClientId, redirectAllowed } = await import("./provider.server");
  const { logOAuthEvent } = await import("./debug-events.server");
  const requested = (data.scope ?? "openid").split(" ").filter(Boolean);
  const detail = {
    redirectUri: data.redirectUri,
    scopes: requested,
    hasPkce: data.codeChallenge.length > 0,
    pkceMethod: data.codeChallengeMethod ?? null,
  };
  const fail = (code: string, error: string, back?: string, debug?: AuthorizeDebug) => {
    logOAuthEvent(data.clientId, "authorize", "error", code, detail);
    return {
      error,
      ...(back ? { redirectTo: errorRedirect(data.redirectUri, data.state, back, error) } : {}),
      ...(debug ? { debug } : {}),
    } as const;
  };
  const client = await getClientByClientId(data.clientId);
  if (!client || client.status !== "active") return fail("invalid_client", "Deze app is onbekend bij ROUT.");
  if (!redirectAllowed(client, data.redirectUri)) {
    return fail("invalid_redirect_uri", "Het terugkeeradres van deze app klopt niet.");
  }
  const { parseOidcPrompt, parseMaxAge } = await import("./token-policy");
  try { parseOidcPrompt(data.prompt); parseMaxAge(data.maxAge); }
  catch { return fail("invalid_request", "Ongeldige prompt of max_age.", "invalid_request"); }

  const hasPkce = data.codeChallenge.length > 0;
  if (hasPkce && (data.codeChallengeMethod !== "S256" || data.codeChallenge.length < 43)) {
    return fail("invalid_pkce_method", "Deze app moet PKCE met S256 gebruiken.", "invalid_request");
  }
  if (!hasPkce && (client.requirePkce || !client.hasSecret)) {
    return fail("missing_code_challenge", "Deze app moet PKCE (S256) meesturen.", "invalid_request");
  }
  const { validateRequestedScopes } = await import("./scope-rules");
  const validation = validateRequestedScopes(requested, client.scopes);
  if (!validation.ok) return fail("invalid_scope", `Deze app vraagt een recht dat niet mag: ${validation.unknown}.`, "invalid_scope");
  const scopes = validation.scopes;
  const stepUp = needsStepUp({
    flowPreference: client.flowPreference,
    prompt: data.prompt ?? null,
    maxAge: data.maxAge ?? null,
    acrValues: data.acrValues ?? null,
  });
  logOAuthEvent(data.clientId, "authorize", "success", null, detail);
  return { client, scopes, stepUp } as const;
}

import { redirectWith, errorRedirect } from "./authorize-redirect";

export const describeAuthorizeRequest = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => authorizeSchema.parse(data))
  .handler(async ({ data, context }): Promise<AuthorizePrompt> => {
    const checked = await checkRequest(data);
    if ("error" in checked) {
      const { getOwnedRedirectMismatch } = await import("./owner-redirect.server");
      const debug = await getOwnedRedirectMismatch(context.userId, data.clientId, data.redirectUri);
      return {
        ok: false,
        ...(debug ? { debug } : {}),
        error: checked.error,
        ...("redirectTo" in checked ? { redirectTo: checked.redirectTo } : {}),
        ...("debug" in checked && checked.debug ? { debug: checked.debug } : {}),
      };
    }
    const { client, scopes, stepUp } = checked;
    const { hasConsent, userMayUseClient, isVerifiedApp } = await import("./provider.server");
    if (!(await userMayUseClient(client, { id: context.userId, email: context.user.email }))) {
      const error = "Deze app is nog in testfase. Enkel uitgenodigde testgebruikers kunnen inloggen.";
      return { ok: false, error, redirectTo: errorRedirect(data.redirectUri, data.state, "access_denied", error) };
    }
    return {
      ok: true,
      app: {
        name: client.name,
        logoUrl: client.logoUrl,
        homepageUrl: client.homepageUrl,
        privacyUrl: client.privacyUrl,
        termsUrl: client.termsUrl,
        verified: await isVerifiedApp(client.clientId),
      },
      scopes,
      account: {
        email: context.user.email,
        name: (context.user.userMetadata["full_name"] as string | null) ?? null,
        ...(await profileOf(context.userId)),
      },
      linkedProviders: await (async () => {
        const { linkedAccountsOf } = await import("./provider.server");
        const list = await linkedAccountsOf(context.userId).catch(() => []);
        return [...new Set(list.map((l) => l.provider))];
      })(),
      ...(await (async () => {
        if (!scopes.includes("email")) return {};
        try {
          const { emailOptionsOf, appEmailFor } = await import("./email-broker.server");
          const options = await emailOptionsOf(context.userId, client.clientId);
          const current = await appEmailFor(context.userId, client.clientId);
          return { emailOptions: options.map((o) => ({ id: o.id, source: o.source, email: o.email })), emailChoice: current?.id ?? "primary" };
        } catch {
          return {};
        }
      })()),
      alreadyGranted: await hasConsent(context.userId, client.clientId, scopes),
      grantedScopes: await (async () => {
        const { grantedScopesOf } = await import("./provider.server");
        return (await grantedScopesOf(context.userId, client.clientId).catch(() => [] as string[]))
          .filter((s) => scopes.includes(s));
      })(),
      requiresStepUp: stepUp || scopes.includes("identity:national_id"),
      richIdentity: client.richIdentityEnabled,
      trustedKycPartner: await (async () => {
        const { isTrustedKycPartner } = await import("./provider.server");
        return isTrustedKycPartner(client.clientId).catch(() => false);
      })(),
    };
  });

/**
 * Blind Hash Matching: the member's own identities, sent only to the member's
 * browser so the enclave worker can compare them with the partner's hashes
 * locally. Requires the member session; the app never calls this.
 */
export const getMyMatchIdentities = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { matchableIdentitiesOf } = await import("./provider.server");
    return { identities: await matchableIdentitiesOf(context.userId) };
  });

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

export const decideAuthorizeRequest = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    authorizeSchema.extend({ allow: z.boolean(), richIdentityOptIn: z.boolean().optional(), emailChoice: z.string().max(64).optional(), declinedScopes: z.array(z.string().max(64)).max(20).optional(),
      // Blind Hash Matching: hashes travel in the URL fragment and this body only; never stored or logged.
      blindHashes: z.array(hex64).max(20).optional(),
      matchedIdentity: z.object({ kind: z.string().max(20), value: z.string().min(1).max(320) }).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ redirectTo: string } | { error: string }> => {
    {
      const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
      const { RATE_RULES } = await import("@/lib/rate-limit-rules");
      const rl = await hitRateLimit("oauth-authorize", context.userId, RATE_RULES.oauthAuthorize);
      if (!rl.ok) return { error: "Te veel pogingen. Probeer het later opnieuw." };
    }
    const checked = await checkRequest(data);
    if ("error" in checked) return { error: checked.error ?? "Ongeldige aanvraag." };
    const { client, stepUp: baseStepUp } = checked;
    const { applyConsentToggles } = await import("./scope-rules");
    const scopes = applyConsentToggles(checked.scopes, data.declinedScopes);
    const { isTrustedKycPartner } = await import("./provider.server");
    if (scopes.includes("identity:national_id") && !(await isTrustedKycPartner(client.clientId))) {
      return { error: "Deze app mag je rijksregisternummer niet opvragen." };
    }
    // The national registry scope always needs a fresh step-up (passkey or code).
    const stepUp = baseStepUp || scopes.includes("identity:national_id");
    const { issueAuthorizationCode, rememberConsent, userMayUseClient, consumeVerifiedStepUp } =
      await import("./provider.server");
    if ((data.prompt ?? "").split(" ").includes("none")) return { error: "prompt=none vereist het stille autorisatiepad." };

    if (!data.allow) {
      return {
        redirectTo: redirectWith(data.redirectUri, data.state, {
          error: "access_denied",
          error_description: "De gebruiker gaf geen toestemming.",
        }),
      };
    }
    if (!(await userMayUseClient(client, { id: context.userId, email: context.user.email }))) {
      return {
        redirectTo: redirectWith(data.redirectUri, data.state, {
          error: "access_denied",
          error_description: "Deze app is in testfase en dit account is geen testgebruiker.",
        }),
      };
    }
    const { authorizationRequestId } = await import("./step-up-binding");
    const requestId = await authorizationRequestId(data);
    if (stepUp && !(await consumeVerifiedStepUp(context.userId, client.clientId, requestId))) {
      return { error: "Bevestig eerst de verificatiecode." };
    }

    // Save the e-mail choice before any code exists: a relay choice that cannot be
    // saved must never fall back to sending the real address to the app.
    if (scopes.includes("email") && data.emailChoice) {
      const { assignAppEmail } = await import("./email-broker.server");
      try {
        await assignAppEmail(context.userId, client.clientId, data.emailChoice);
      } catch (e) {
        console.warn("[oauth] email choice not saved", (e as Error)?.message);
        if (data.emailChoice !== "primary") return { error: "Je e-mailkeuze kon niet worden opgeslagen. Probeer het opnieuw." };
      }
    }
    // Blind Hash Matching: disclose one identity only when the member owns it,
    // the app asked for accounts:merge and the app's own hash list contains it.
    let disclosure: import("./blind-hash").BhmIdentity | null = null;
    if (data.matchedIdentity && scopes.includes("accounts:merge")) {
      const { bhmPreimage, isBhmKind, normalizeIdentityValue } = await import("./blind-hash");
      const kind = data.matchedIdentity.kind;
      if (!isBhmKind(kind)) return { error: "Onbekend accounttype." };
      const value = normalizeIdentityValue(kind, data.matchedIdentity.value);
      const { matchableIdentitiesOf } = await import("./provider.server");
      const owned = (await matchableIdentitiesOf(context.userId)).some((i) => i.kind === kind && i.value === value);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bhmPreimage(client.clientId, { kind, value }))));
      const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
      if (!owned || !(data.blindHashes ?? []).includes(hex)) return { error: "Dit account kon niet worden bevestigd." };
      disclosure = { kind, value };
    }
    const code = await issueAuthorizationCode({
      disclosure,
      acr: stepUp ? STRICT_ACR : null,
      richIdentity: shareRichIdentity(client.richIdentityEnabled, Boolean(data.richIdentityOptIn)),
      clientId: client.clientId,
      userId: context.userId,
      redirectUri: data.redirectUri,
      scopes,
      codeChallenge: data.codeChallenge,
      nonce: data.nonce ?? null,
    });
    const { hasConsent: hadConsent } = await import("./provider.server");
    const firstTime = !(await hadConsent(context.userId, client.clientId, scopes).catch(() => true));
    await rememberConsent(context.userId, client.clientId, scopes);
    if (firstTime) {
      const { later, recipient, sendSiteMail, siteOrigin } = await import("@/lib/site-mail.server");
      later(async () => {
        const r = await recipient(context.userId);
        const { appConnectedMail } = await import("@/emails/site-mails");
        await sendSiteMail(r.email, appConnectedMail({ lang: r.lang, name: r.name, app: client.name, scopes, manageUrl: `${siteOrigin()}/dashboard` }), ["console", "app-connected"]);
      });
    }
    const { issuer } = await import("./provider.server");
    return { redirectTo: redirectWith(data.redirectUri, data.state, { code, iss: issuer() }) };
  });

/**
 * `prompt=none` — Account Auto-Discovery. Never shows a screen: either a code
 * (existing session + existing consent) or an OIDC error back to the app.
 * Works without a session, hence `optionalAuth`.
 */
export const silentAuthorize = createServerFn({ method: "POST" })
  .middleware([optionalAuth])
  .inputValidator((data: unknown) => authorizeSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ redirectTo: string } | { error: string }> => {
    const checked = await checkRequest(data);
    if ("error" in checked) return { error: checked.error ?? "Ongeldige aanvraag." };
    const { client, scopes, stepUp } = checked;
    const fail = (error: string, description: string) => ({
      redirectTo: redirectWith(data.redirectUri, data.state, { error, error_description: description }),
    });

    if (!client.accountDiscoveryEnabled) {
      return fail("interaction_required", "Account Auto-Discovery staat uit voor deze app.");
    }
    if (!context.user || !context.userId) return fail("login_required", "Geen actieve ROUT-sessie.");
    const hint = data.loginHint?.trim().toLowerCase();
    if (hint) {
      const { handle } = await profileOf(context.userId);
      const matches =
        hint === context.user.email.toLowerCase() || hint.replace(/^@/, "") === handle?.toLowerCase();
      if (!matches) return fail("login_required", "De actieve sessie hoort bij een ander account.");
    }
    const { hasConsent, userMayUseClient, issueAuthorizationCode } = await import("./provider.server");
    if (!(await userMayUseClient(client, { id: context.userId, email: context.user.email }))) {
      return fail("access_denied", "Deze app is in testfase en dit account is geen testgebruiker.");
    }
    if (stepUp) return fail("interaction_required", "Deze aanvraag vereist een extra verificatiestap.");
    if (!(await hasConsent(context.userId, client.clientId, scopes))) {
      return fail("consent_required", "De gebruiker gaf deze app nog geen toestemming.");
    }
    const code = await issueAuthorizationCode({
      acr: null,
      richIdentity: false,
      clientId: client.clientId,
      userId: context.userId,
      redirectUri: data.redirectUri,
      scopes,
      codeChallenge: data.codeChallenge,
      nonce: data.nonce ?? null,
    });
    const { issuer } = await import("./provider.server");
    return { redirectTo: redirectWith(data.redirectUri, data.state, { code, iss: issuer() }) };
  });

/* ------------------------------------------------------------ step-up ---- */

/** JSON-compatible value — the only shape TanStack Start may serialize. */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const stepUpBindingSchema = z.object({
  clientId: z.string().min(4).max(120),
  redirectUri: z.string().min(4).max(2000).transform((v) => cleanRedirectUri(v)),
  state: z.string().max(300).nullable().optional(),
  nonce: z.string().max(300).nullable().optional(),
  codeChallenge: z.string().max(200),
});

/** Server-derived id of the authorization request a step-up proof is bound to. */
async function stepUpRequest(data: z.infer<typeof stepUpBindingSchema>) {
  const { getClientByClientId, redirectAllowed } = await import("./provider.server");
  const client = await getClientByClientId(data.clientId);
  if (!client || client.status !== "active" || !redirectAllowed(client, data.redirectUri)) return null;
  const { authorizationRequestId } = await import("./step-up-binding");
  return { client, requestId: await authorizationRequestId(data) };
}

export const sendStepUpCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => stepUpBindingSchema.parse(data))
  .handler(async ({ data, context }) => {
    const req = await stepUpRequest(data);
    if (!req) return { ok: false, error: "Deze app is onbekend bij ROUT." };
    const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
    const rl = await hitRateLimit("oauth-step-up-send", context.userId, { limit: 5, windowSec: 600 });
    if (!rl.ok) return { ok: false, error: "Te veel aanvragen. Probeer het later opnieuw." };
    const { client, requestId } = req;
    const { createStepUpCode } = await import("./provider.server");
    const code = await createStepUpCode(context.userId, client.clientId, requestId);
    const { sendTransactionalEmail } = await import("@/lib/notifications.server");
    const safeName = client.name.replace(/[<>&"]/g, "");
    const sent = await sendTransactionalEmail({
      to: context.user.email,
      subject: `Je ROUT-code: ${code}`,
      html: `<p>Je verificatiecode om door te gaan naar <strong>${safeName}</strong>:</p>
             <p style="font-size:28px;letter-spacing:6px;font-family:monospace"><strong>${code}</strong></p>
             <p>Deze code is 5 minuten geldig. Vroeg je dit niet aan? Negeer dan deze e-mail.</p>`,
      tags: ["oauth-step-up"],
    });
    const [user, domain] = context.user.email.split("@");
    const masked = `${(user ?? "").slice(0, 2)}•••@${domain ?? ""}`;
    return sent ? { ok: true, sentTo: masked } : { ok: false, error: "De code kon niet verstuurd worden." };
  });

export const verifyStepUp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => stepUpBindingSchema.extend({ code: z.string().regex(/^\d{6}$/) }).parse(data))
  .handler(async ({ data, context }) => {
    const req = await stepUpRequest(data);
    if (!req) return { ok: false, error: "Deze app is onbekend bij ROUT." };
    const { verifyStepUpCode } = await import("./provider.server");
    const state = await verifyStepUpCode(context.userId, req.client.clientId, req.requestId, data.code);
    const messages: Record<string, string> = {
      ok: "",
      wrong: "Die code klopt niet.",
      expired: "Deze code is verlopen. Vraag een nieuwe aan.",
      locked: "Te veel pogingen. Vraag een nieuwe code aan.",
      missing: "Vraag eerst een code aan.",
    };
    return { ok: state === "ok", error: messages[state] ?? "" };
  });

/** Passkey step-up, step 1: single-use challenge bound to this authorization request. */
export const startPasskeyStepUpFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => stepUpBindingSchema.parse(data))
  .handler(async ({ data, context }) => {
    const req = await stepUpRequest(data);
    if (!req) return { ok: false as const, error: "Deze app is onbekend bij ROUT." };
    const { startPasskeyStepUp } = await import("./provider.server");
    const options = await startPasskeyStepUp(context.userId, req.client.clientId, req.requestId);
    return options ? { ok: true as const, options: JSON.parse(JSON.stringify(options)) as JsonValue } : { ok: false as const, error: "Geen passkey gevonden voor dit account." };
  });

const assertionSchema = z.object({
  id: z.string().max(1024),
  rawId: z.string().max(1024),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string().max(4096),
    authenticatorData: z.string().max(4096),
    signature: z.string().max(4096),
    userHandle: z.string().max(1024).optional(),
  }),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  authenticatorAttachment: z.string().max(40).optional(),
});

/** Passkey step-up, step 2: server-side WebAuthn verification. */
export const finishPasskeyStepUpFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => stepUpBindingSchema.extend({ assertion: assertionSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const req = await stepUpRequest(data);
    if (!req) return { ok: false, error: "Deze app is onbekend bij ROUT." };
    const { finishPasskeyStepUp } = await import("./provider.server");
    const result = await finishPasskeyStepUp(context.userId, req.client.clientId, req.requestId, data.assertion);
    const messages: Record<string, string> = {
      ok: "",
      expired: "De passkey-aanvraag is verlopen. Probeer opnieuw.",
      origin: "Deze passkey-bevestiging komt niet van ROUT.",
      challenge: "Deze passkey-bevestiging hoort niet bij dit verzoek.",
      unknown_key: "Deze passkey hoort niet bij je account.",
      invalid: "De passkey kon niet worden geverifieerd.",
      counter: "Deze passkey lijkt gekopieerd. Gebruik een andere methode.",
    };
    return { ok: result === "ok", error: messages[result] ?? "" };
  });

/** Explicit owner action; never accepts an owner identity from the browser. */
export const addOwnerRedirect = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({
    clientId: z.string().min(1).max(100),
    redirectUri: z.string().min(4).max(2000),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { addOwnedRedirect } = await import("./owner-redirect.server");
    await addOwnedRedirect(context.userId, data.clientId, data.redirectUri);
    return { ok: true };
  });
