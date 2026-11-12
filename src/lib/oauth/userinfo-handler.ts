/**
 * OIDC userinfo-afhandeling, los van de route zodat de toegangsregels testbaar zijn.
 * Zonder geldig bearer-token: 401. Scope ontbreekt: 403. Interne fout: 503
 * met een generieke melding — de ruwe (database)fout verlaat de server nooit.
 */
import { GENERIC_TEMPORARY_ERROR, logServerError } from "@/lib/security/safe-errors";

export type UserInfoDeps = {
  verifyAccessToken: (token: string) => Promise<{
    sub: string;
    userId: string;
    scopes: string[];
    clientId: string | null;
    acr: string | null;
  }>;
  generateUserInfoResponse: (
    userId: string,
    clientId: string,
    scopes: string[],
    ctx: { sub: string; acr: string | null; ip: string | null },
  ) => Promise<unknown>;
  isOAuthError: (error: unknown) => error is Error & { code?: string };
  isScopeForbidden: (error: unknown) => error is Error & { code: string };
};

const HEADERS = { "access-control-allow-origin": "*", "cache-control": "no-store" };

export async function handleUserInfo(request: Request, deps: UserInfoDeps): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ") || !auth.slice(7).trim()) {
    return Response.json(
      { error: "invalid_token", error_description: "Bearer-token ontbreekt." },
      { status: 401, headers: { ...HEADERS, "www-authenticate": 'Bearer error="invalid_token"' } },
    );
  }

  let identity: Awaited<ReturnType<UserInfoDeps["verifyAccessToken"]>>;
  try {
    identity = await deps.verifyAccessToken(auth.slice(7).trim());
  } catch (error) {
    if (deps.isOAuthError(error)) {
      // Eigen, vaste meldingen (bv. "Token is ingetrokken.") zijn veilig om te tonen.
      return Response.json(
        { error: "invalid_token", error_description: error.message },
        { status: 401, headers: { ...HEADERS, "www-authenticate": 'Bearer error="invalid_token"' } },
      );
    }
    logServerError("oauth.userinfo", error);
    return Response.json(
      { error: "temporarily_unavailable", error_description: GENERIC_TEMPORARY_ERROR },
      { status: 503, headers: HEADERS },
    );
  }

  try {
    const ip =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const body = await deps.generateUserInfoResponse(identity.userId, identity.clientId ?? "", identity.scopes, {
      sub: identity.sub,
      acr: identity.acr,
      ip,
    });
    return Response.json(body, { headers: HEADERS });
  } catch (error) {
    if (deps.isScopeForbidden(error)) {
      return Response.json(
        { error: "insufficient_scope", error_description: error.code },
        { status: 403, headers: HEADERS },
      );
    }
    logServerError("oauth.userinfo", error);
    return Response.json(
      { error: "temporarily_unavailable", error_description: GENERIC_TEMPORARY_ERROR },
      { status: 503, headers: HEADERS },
    );
  }
}
