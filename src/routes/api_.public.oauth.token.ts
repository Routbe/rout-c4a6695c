import { createFileRoute } from "@tanstack/react-router";

/**
 * Token-endpoint: wisselt een autorisatiecode in voor een id- en access-token.
 * Verplicht PKCE S256; codes zijn eenmalig en kortlevend.
 */
export const Route = createFileRoute("/api_/public/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type, authorization",
          },
        }),
      POST: async ({ request }) => {
        const cors = { "access-control-allow-origin": "*" };
        const fail = (code: string, description: string, status = 400) =>
          Response.json({ error: code, error_description: description }, { status, headers: cors });

        const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
        const { RATE_RULES, tooManyRequests } = await import("@/lib/rate-limit-rules");
        const limit = await hitRateLimit("oauth-token", clientIp(request), RATE_RULES.oauthToken);
        if (!limit.ok) return tooManyRequests(limit.retryAfter, cors);

        let form: URLSearchParams;
        try {
          const contentType = request.headers.get("content-type") ?? "";
          form = contentType.includes("application/json")
            ? new URLSearchParams(Object.entries((await request.json()) as Record<string, string>))
            : new URLSearchParams(await request.text());
        } catch {
          return fail("invalid_request", "De aanvraag kon niet gelezen worden.");
        }

        if (form.get("grant_type") === "refresh_token") {
          const { readTokenRequest, tokenFailure } = await import("@/lib/oauth/token-request.server");
          const normalized = new URLSearchParams(form);
          normalized.set("token", normalized.get("refresh_token") ?? "");
          try {
            const input = await readTokenRequest(new Request(request.url, { method: "POST", headers: request.headers, body: normalized.toString() }));
            const { exchangeRefreshToken } = await import("@/lib/oauth/tokens.server");
            const scope = form.get("scope");
            if (scope && scope.length > 500) return fail("invalid_request", "Scope-parameter te lang.");
            return Response.json(await exchangeRefreshToken({ ...input, requestedScope: scope }),{ headers: { ...cors,"cache-control":"no-store",pragma:"no-cache" } });
          } catch(error) { return tokenFailure(error); }
        }
        if (form.get("grant_type") === "client_credentials") {
          let id = form.get("client_id");
          let secret = form.get("client_secret");
          const auth = request.headers.get("authorization");
          if (auth?.toLowerCase().startsWith("basic ")) {
            if (secret) return fail("invalid_client", "Gebruik slechts één client-authenticatiemethode.", 401);
            try {
              const [a, b] = atob(auth.slice(6)).split(":");
              id = decodeURIComponent(a ?? "");
              secret = decodeURIComponent(b ?? "");
            } catch {
              return fail("invalid_client", "Ongeldige client-authenticatie.", 401);
            }
          }
          if (!id || !secret) return fail("invalid_client", "Client-authenticatie vereist.", 401);
          try {
            const { authenticateOAuthClient, issuer, signJwt } = await import("@/lib/oauth/provider.server");
            const client = await authenticateOAuthClient(id, secret, clientIp(request), true);
            const { m2mClaims, m2mScopes, M2M_TOKEN_TTL_SEC } = await import("@/lib/oauth/m2m-rules");
            const scopes = m2mScopes(form.get("scope"), client.scopes);
            if (!scopes) return fail("invalid_scope", "Deze scopes zijn niet toegestaan voor machine-toegang.");
            const claims = m2mClaims({ issuer: issuer(), clientId: id, scopes, nowSec: Math.floor(Date.now() / 1000), jti: crypto.randomUUID() });
            const { recordSecurityEvent } = await import("@/lib/audit-log.server");
            void recordSecurityEvent({ eventType: "oauth.m2m_token", payload: { clientId: id, scopes } });
            return Response.json(
              { access_token: await signJwt(claims), token_type: "Bearer", expires_in: M2M_TOKEN_TTL_SEC, scope: scopes.join(" ") },
              { headers: { ...cors, "cache-control": "no-store", pragma: "no-cache" } },
            );
          } catch {
            return fail("invalid_client", "Ongeldige client.", 401);
          }
        }
        if (form.get("grant_type") !== "authorization_code") {
          return fail("unsupported_grant_type", "Ondersteund: authorization_code, refresh_token, client_credentials.");
        }
        const code = form.get("code");
        const redirectUri = form.get("redirect_uri");
        const codeVerifier = form.get("code_verifier");
        let clientId = form.get("client_id");
        let clientSecret = form.get("client_secret");

        const basic = request.headers.get("authorization");
        if (basic?.toLowerCase().startsWith("basic ")) {
          if (clientSecret) return fail("invalid_client", "Gebruik slechts één client-authenticatiemethode.", 401);
          try {
            const [id, secret] = atob(basic.slice(6)).split(":");
            clientId = clientId ?? decodeURIComponent(id ?? "");
            clientSecret = clientSecret ?? decodeURIComponent(secret ?? "");
          } catch {
            return fail("invalid_client", "Ongeldige client-authenticatie.", 401);
          }
        }

        if (!code || !redirectUri || !clientId) {
          return fail("invalid_request", "Verplichte velden ontbreken.");
        }

        const { logOAuthEvent } = await import("@/lib/oauth/debug-events.server");
        const detail = { redirectUri, hasPkce: Boolean(codeVerifier) };
        try {
          const { exchangeAuthorizationCode } = await import("@/lib/oauth/provider.server");
          const tokens = await exchangeAuthorizationCode({
            code,
            clientId,
            clientSecret,
            redirectUri,
            codeVerifier: codeVerifier || null,
            clientIp:
              request.headers.get("cf-connecting-ip") ??
              request.headers.get("x-real-ip") ??
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
              null,
          });
          logOAuthEvent(clientId, "token", "success", null, detail);
          return Response.json(tokens, {
            headers: { ...cors, "cache-control": "no-store", pragma: "no-cache" },
          });
        } catch (error) {
          const anyError = error as { code?: string; message?: string };
          logOAuthEvent(clientId, "token", "error", anyError.code ?? "invalid_grant", {
            ...detail,
            message: anyError.message,
          });
          return fail(
            anyError.code ?? "invalid_grant",
            anyError.message ?? "De code kon niet ingewisseld worden.",
            anyError.code === "invalid_client" ? 401 : 400,
          );
        }
      },
    },
  },
});
