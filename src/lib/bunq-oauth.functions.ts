/**
 * Client-veilige serverfuncties voor de bunq OAuth-koppeling.
 * De implementatie zit in `bunq-oauth.server.ts` en wordt uitsluitend binnen
 * de handlers geladen.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Start: geeft de officiële bunq-inlog-URL terug voor dit lid. */
export const startBunqOAuth = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { bunqOAuthConfigured, bunqOAuthAuthorizeUrl } = await import("./bunq-oauth.server");
    if (!bunqOAuthConfigured()) {
      return { ok: false as const, reason: "bunq_oauth_not_configured" as const };
    }
    return { ok: true as const, url: bunqOAuthAuthorizeUrl(context.userId) };
  });

/**
 * Callback: wisselt de code in voor een access-token. De `state` bepaalt voor
 * welk lid de koppeling geldt en moet overeenkomen met de ingelogde gebruiker.
 */
export const completeBunqOAuth = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ code: z.string().trim().min(4).max(512), state: z.string().trim().max(256) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { verifyBunqOAuthState, exchangeBunqOAuthCode } = await import("./bunq-oauth.server");
    const stateUser = verifyBunqOAuthState(data.state);
    if (!stateUser || stateUser !== context.userId) {
      return { ok: false as const, reason: "invalid_state" as const };
    }
    const result = await exchangeBunqOAuthCode(data.code, context.userId);
    if (!result.ok) return { ok: false as const, reason: result.reason };
    return { ok: true as const, scope: result.token.scope, environment: result.token.environment };
  });

/** Statuskaart voor de UI: is bunq gekoppeld? */
export const bunqOAuthStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { bunqOAuthConfigured, getBunqOAuthToken, bunqOAuthEnvironment } =
      await import("./bunq-oauth.server");
    const token = bunqOAuthConfigured() ? await getBunqOAuthToken(context.userId) : null;
    return {
      configured: bunqOAuthConfigured(),
      linked: Boolean(token),
      environment: bunqOAuthEnvironment(),
      scope: token?.scope ?? null,
    };
  });

/** Koppeling verbreken. */
export const disconnectBunqOAuth = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { revokeBunqOAuthToken } = await import("./bunq-oauth.server");
    await revokeBunqOAuthToken(context.userId);
    return { ok: true as const };
  });
