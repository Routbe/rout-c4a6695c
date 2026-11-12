/**
 * Officiële bunq OAuth-koppeling (server-only).
 *
 * Flow:
 *   1. `bunqOAuthAuthorizeUrl(userId)` bouwt de bunq-inlog-URL met een
 *      ondertekende `state` (HMAC over user-id + tijdstempel). Geen extra
 *      tabel nodig en niet te vervalsen.
 *   2. bunq stuurt de gebruiker terug naar `https://rout.be/auth/callback`
 *      met `?code=...&state=...`.
 *   3. `exchangeBunqOAuthCode()` wisselt de code in voor een access-token en
 *      slaat dat op in `public.bunq_oauth_tokens` (één rij per gebruiker per
 *      omgeving).
 *
 * Vereiste omgevingsvariabelen:
 *   BUNQ_OAUTH_CLIENT_ID
 *   BUNQ_OAUTH_CLIENT_SECRET
 *   BUNQ_ENV                (production | sandbox, default production)
 *   PUBLIC_SITE_URL         (default https://rout.be)
 */
import { createHmac, timingSafeEqual } from "crypto";
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

export function bunqOAuthEnvironment(): "production" | "sandbox" {
  return process.env["BUNQ_ENV"] === "sandbox" ? "sandbox" : "production";
}

export function bunqOAuthConfigured(): boolean {
  return Boolean(process.env["BUNQ_OAUTH_CLIENT_ID"] && process.env["BUNQ_OAUTH_CLIENT_SECRET"]);
}

function clientId(): string {
  return process.env["BUNQ_OAUTH_CLIENT_ID"]!;
}

function clientSecret(): string {
  return process.env["BUNQ_OAUTH_CLIENT_SECRET"]!;
}

/** Vaste redirect-URL: exact zoals geregistreerd in het bunq-portaal. */
export function bunqOAuthRedirectUri(): string {
  const base = (process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "");
  return `${base}/auth/callback`;
}

function authorizeBase(): string {
  return bunqOAuthEnvironment() === "sandbox"
    ? "https://oauth.sandbox.bunq.com/auth"
    : "https://oauth.bunq.com/auth";
}

function tokenBase(): string {
  return bunqOAuthEnvironment() === "sandbox"
    ? "https://api-oauth.sandbox.bunq.com/v1/token"
    : "https://api.oauth.bunq.com/v1/token";
}

/** `bunq.<userId>.<issuedAt>.<hmac>` — herkenbaar én niet te vervalsen. */
export function signBunqOAuthState(userId: string, issuedAt = Date.now()): string {
  const payload = `bunq.${userId}.${issuedAt}`;
  const mac = createHmac("sha256", clientSecret()).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${mac}`;
}

/** True zodra de callback-parameter van *onze* bunq-flow komt. */
export function isBunqOAuthState(state: string | null | undefined): boolean {
  return typeof state === "string" && state.startsWith("bunq.");
}

const STATE_TTL_MS = 15 * 60 * 1000;

/** Geeft de user-id terug wanneer de state geldig en vers is, anders null. */
export function verifyBunqOAuthState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 4 || parts[0] !== "bunq") return null;
  const [, userId, issuedAtRaw, mac] = parts as [string, string, string, string];
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_TTL_MS) return null;

  const expected = createHmac("sha256", clientSecret())
    .update(`bunq.${userId}.${issuedAtRaw}`)
    .digest("hex")
    .slice(0, 32);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return userId;
}

/** De URL waar de gebruiker zijn bunq-account veilig koppelt. */
export function bunqOAuthAuthorizeUrl(userId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: bunqOAuthRedirectUri(),
    state: signBunqOAuthState(userId),
  });
  return `${authorizeBase()}?${params.toString()}`;
}

export interface BunqOAuthToken {
  accessToken: string;
  tokenType: string;
  scope: string | null;
  environment: string;
}

/**
 * Wisselt de autorisatiecode in voor een access-token en bewaart die.
 * Gooit nooit door naar de gebruiker: geeft een korte reden terug.
 */
export async function exchangeBunqOAuthCode(
  code: string,
  userId: string,
): Promise<{ ok: true; token: BunqOAuthToken } | { ok: false; reason: string }> {
  if (!bunqOAuthConfigured()) return { ok: false, reason: "bunq_oauth_not_configured" };

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: bunqOAuthRedirectUri(),
    client_id: clientId(),
    client_secret: clientSecret(),
  });

  let payload: {
    access_token?: string;
    token_type?: string;
    scope?: string;
    state?: string;
    Error?: { error_description?: string }[];
    error?: string;
    error_description?: string;
  };
  try {
    const res = await fetch(`${tokenBase()}?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    payload = (await res.json()) as typeof payload;
    if (!res.ok || !payload.access_token) {
      console.error("[bunq-oauth] token exchange geweigerd", {
        status: res.status,
        reason: payload.error_description ?? payload.error ?? payload.Error?.[0]?.error_description,
      });
      return { ok: false, reason: "token_exchange_failed" };
    }
  } catch (error) {
    console.error("[bunq-oauth] token exchange netwerkfout", error);
    return { ok: false, reason: "token_exchange_failed" };
  }

  const token: BunqOAuthToken = {
    accessToken: payload.access_token,
    tokenType: payload.token_type ?? "bearer",
    scope: payload.scope ?? null,
    environment: bunqOAuthEnvironment(),
  };

  await sql`
    insert into public.bunq_oauth_tokens (user_id, access_token, token_type, scope, environment)
    values (${userId}, ${token.accessToken}, ${token.tokenType}, ${token.scope}, ${token.environment})
    on conflict (user_id, environment) do update
       set access_token = excluded.access_token,
           token_type = excluded.token_type,
           scope = excluded.scope,
           revoked_at = null,
           updated_at = now()
  `;

  return { ok: true, token };
}

/** Actief OAuth-token van dit lid, of null wanneer er geen koppeling is. */
export async function getBunqOAuthToken(userId: string): Promise<BunqOAuthToken | null> {
  const rows = (await sql`
    select access_token, token_type, scope, environment
      from public.bunq_oauth_tokens
     where user_id = ${userId}
       and environment = ${bunqOAuthEnvironment()}
       and revoked_at is null
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  return {
    accessToken: String(row["access_token"]),
    tokenType: String(row["token_type"] ?? "bearer"),
    scope: (row["scope"] as string | null) ?? null,
    environment: String(row["environment"]),
  };
}

/** Koppeling verbreken (token blijft bewaard als audittrail, maar inactief). */
export async function revokeBunqOAuthToken(userId: string): Promise<void> {
  await sql`
    update public.bunq_oauth_tokens
       set revoked_at = now(), updated_at = now()
     where user_id = ${userId} and environment = ${bunqOAuthEnvironment()}
  `;
}

/**
 * API-key voor de bunq-installatie: het OAuth-token vervángt de persoonlijke
 * API-key. `bunq.server.ts` gebruikt deze wanneer een actie namens een
 * gekoppeld lid moet lopen; zonder koppeling blijft `BUNQ_API_KEY` gelden.
 */
export async function bunqApiKeyForUser(userId: string | null): Promise<string | null> {
  if (userId) {
    const token = await getBunqOAuthToken(userId);
    if (token) return token.accessToken;
  }
  return process.env["BUNQ_API_KEY"] ?? null;
}
