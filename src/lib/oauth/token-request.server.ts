import { z } from "zod";
import { OAuthError } from "./provider.server";

export const TOKEN_CORS = { "access-control-allow-origin": "*", "cache-control": "no-store", pragma: "no-cache" };
export function tokenOptions() {
  return new Response(null, { status: 204, headers: { ...TOKEN_CORS, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, content-type" } });
}

export async function readTokenRequest(request: Request) {
  const body = await request.text();
  if (body.length>16384) throw new OAuthError("invalid_request", "Aanvraag te groot.");
  const form = new URLSearchParams(body);
  for (const key of new Set(form.keys())) if (form.getAll(key).length !== 1) throw new OAuthError("invalid_request", "Dubbele parameters.");
  let clientId = form.get("client_id");
  let clientSecret = form.get("client_secret");
  const authorization = request.headers.get("authorization");
  if (authorization) {
    if (!/^Basic /i.test(authorization) || clientSecret) throw new OAuthError("invalid_client", "Dubbele of ongeldige client-authenticatie.");
    try {
      const decoded = atob(authorization.slice(6));
      const index = decoded.indexOf(":");
      if (index<1) throw new Error("invalid_basic");
      const basicId = decodeURIComponent(decoded.slice(0,index));
      if (clientId && clientId !== basicId) throw new Error("client_mismatch");
      clientId = basicId;
      clientSecret = decodeURIComponent(decoded.slice(index+1));
    } catch { throw new OAuthError("invalid_client", "Ongeldige client-authenticatie."); }
  }
  const id = z.string().min(1).max(120).parse(clientId);
  const token = z.string().min(1).max(32768).parse(form.get("token"));
  if (clientSecret && clientSecret.length>2048) throw new OAuthError("invalid_client", "Ongeldige client-authenticatie.");
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return { clientId: id, clientSecret, token, ip };
}

export function tokenFailure(error: unknown) {
  const known = error instanceof OAuthError;
  const code = known ? error.code : "invalid_request";
  return Response.json({ error: code, error_description: known ? error.message : "Ongeldige aanvraag." }, { status: code === "invalid_client" ? 401 : 400, headers: TOKEN_CORS });
}