/**
 * Mastodon / Fediverse sign-in.
 *
 * There is no single Mastodon "cloud"
 * to register with: every instance is its own OAuth authorization server. So
 * ROUT registers itself dynamically on whichever instance the user names
 * (POST /api/v1/apps), runs the standard OAuth 2.0 authorization-code flow
 * against that host, verifies the account, and then mints a real ROUT session
 * on our own Neon database for the matching user.
 *
 * The instance-specific client secret never touches the browser: it travels
 * inside the encrypted `state` value and is only ever read back here.
 */
import { newCorrelationId, normalizeCorrelationId } from "./correlation";
import {
  MASTODON_SCOPES,
  fediverseEmail,
  fediverseHandle,
  normalizeInstance,
} from "./mastodon-instance";
import type { MastodonErrorCode } from "./mastodon-auth.errors";

const APP_NAME = "ROUT";
const APP_WEBSITE = "https://rout.be";
const STATE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export class MastodonAuthError extends Error {
  readonly code: MastodonErrorCode;

  constructor(code: MastodonErrorCode, message: string) {
    super(message);
    this.name = "MastodonAuthError";
    this.code = code;
  }
}

/**
 * Structured, single-line server logging — greppable in Vercel / worker logs.
 * Only non-sensitive fields are ever recorded: no tokens, no keys, no state.
 */
/**
 * Correlation id of the sign-in attempt currently being handled. Set once at
 * the entry of each flow so every log line of that attempt shares one id and
 * can be followed end-to-end in the Vercel runtime logs.
 */
let currentCorrelationId: string | null = null;

export function setMastodonCorrelationId(cid: string | null): string {
  currentCorrelationId = cid ?? newCorrelationId();
  return currentCorrelationId;
}

export function mastodonLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    scope: "mastodon-auth",
    level,
    event,
    cid: currentCorrelationId,
    at: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

type AppCredentials = { clientId: string; clientSecret: string };

/** Best-effort cache so repeat sign-ins skip the registration round-trip. */
const appCache = new Map<string, AppCredentials>();

/**
 * Persistent registration cache (db/0144): one dynamic app registration per
 * instance + redirect URI, so repeat sign-ins never re-POST /api/v1/apps.
 * Falls back to the in-memory cache when the table is not there yet.
 */
async function readRegistrationCache(cacheKey: string): Promise<AppCredentials | null> {
  const [instance, redirectUri] = cacheKey.split("|");
  try {
    const { sql } = await import("./neon");
    const rows = (await sql`
      select client_id, client_secret from public.mastodon_app_registrations
       where instance = ${instance} and redirect_uri = ${redirectUri} limit 1`) as {
      client_id: string;
      client_secret: string;
    }[];
    const row = rows[0];
    return row ? { clientId: row.client_id, clientSecret: row.client_secret } : null;
  } catch {
    return null;
  }
}

async function writeRegistrationCache(cacheKey: string, creds: AppCredentials): Promise<void> {
  const [instance, redirectUri] = cacheKey.split("|");
  try {
    const { sql } = await import("./neon");
    await sql`
      insert into public.mastodon_app_registrations (instance, redirect_uri, client_id, client_secret)
      values (${instance}, ${redirectUri}, ${creds.clientId}, ${creds.clientSecret})
      on conflict (instance, redirect_uri) do nothing`;
  } catch {
    /* cache miss is fine: the in-memory map still covers this run */
  }
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  // SSRF-guard: alleen https, publieke hosts, geen privé/loopback/metadata-IPs.
  const { validateOutboundUrl } = await import("./security/ssrf-guard.server");
  await validateOutboundUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, redirect: "manual", signal: controller.signal });
  } catch {
    throw new MastodonAuthError(
      "instance_unreachable",
      "That instance could not be reached. Check the domain and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ state */

function stateSecret(): string {
  const secret = process.env["MASTODON_STATE_SECRET"] || process.env["DATABASE_URL"];
  if (!secret) {
    throw new MastodonAuthError(
      "not_configured",
      "Mastodon sign-in is not configured: set MASTODON_STATE_SECRET in the deployment environment.",
    );
  }
  return secret;
}

async function stateKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stateSecret()) as BufferSource,
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

type StatePayload = {
  instance: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  next: string;
  exp: number;
  /** Correlation id of this sign-in attempt, so step 2 logs share step 1's id. */
  cid?: string;
};

async function sealState(payload: StatePayload): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await stateKey(), data as BufferSource),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return toBase64Url(out);
}

async function openState(state: string): Promise<StatePayload> {
  let payload: StatePayload;
  try {
    const raw = fromBase64Url(state);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.subarray(0, 12) as BufferSource },
      await stateKey(),
      raw.subarray(12) as BufferSource,
    );
    payload = JSON.parse(new TextDecoder().decode(plain)) as StatePayload;
  } catch {
    throw new MastodonAuthError("state_invalid", "This sign-in request is not valid. Start again.");
  }
  if (!payload.exp || payload.exp < Date.now()) {
    throw new MastodonAuthError("state_expired", "This sign-in request expired. Start again.");
  }
  return payload;
}

/* --------------------------------------------------- dynamic registration */

async function registerApp(instance: string, redirectUri: string): Promise<AppCredentials> {
  const cacheKey = `${instance}|${redirectUri}`;
  const cached = appCache.get(cacheKey) ?? (await readRegistrationCache(cacheKey));
  if (cached) {
    appCache.set(cacheKey, cached);
    return cached;
  }

  const body = new URLSearchParams({
    client_name: APP_NAME,
    redirect_uris: redirectUri,
    scopes: MASTODON_SCOPES,
    website: APP_WEBSITE,
  });
  const res = await timedFetch(`https://${instance}/api/v1/apps`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  if (!res.ok) {
    throw new MastodonAuthError(
      "instance_rejected",
      `${instance} refused the app registration (HTTP ${res.status}). It may not be a Mastodon-compatible server.`,
    );
  }
  const json = (await res.json().catch(() => null)) as {
    client_id?: string;
    client_secret?: string;
  } | null;
  if (!json?.client_id || !json.client_secret) {
    throw new MastodonAuthError(
      "instance_rejected",
      `${instance} returned an unexpected registration response.`,
    );
  }
  const creds = { clientId: json.client_id, clientSecret: json.client_secret };
  appCache.set(cacheKey, creds);
  void writeRegistrationCache(cacheKey, creds);
  return creds;
}

/* ------------------------------------------------------------------ flow */

function safePath(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/claim";
  return next;
}

/** Step 1: register (if needed) and build the instance authorize URL. */
export async function buildMastodonAuthorizeUrl(input: {
  instance: string;
  origin: string;
  next?: string;
  cid?: string;
}): Promise<{ url: string; instance: string; cid: string }> {
  const cid = setMastodonCorrelationId(normalizeCorrelationId(input.cid));
  mastodonLog("info", "start_login", { instance: input.instance });
  const instance = normalizeInstance(input.instance);
  if (!instance) {
    throw new MastodonAuthError(
      "invalid_instance",
      "That does not look like a Fediverse domain — try mastodon.social or your own server.",
    );
  }
  const redirectUri = `${input.origin.replace(/\/$/, "")}/auth/mastodon/callback`;
  const { clientId, clientSecret } = await registerApp(instance, redirectUri);
  const state = await sealState({
    instance,
    clientId,
    clientSecret,
    redirectUri,
    next: safePath(input.next),
    exp: Date.now() + STATE_TTL_MS,
    cid,
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: MASTODON_SCOPES,
    state,
  });
  mastodonLog("info", "authorize_url_built", { instance });
  return { url: `https://${instance}/oauth/authorize?${params.toString()}`, instance, cid };
}

type Account = { id: string; username: string; displayName: string; avatar: string | null; url: string };

async function verifyCredentials(instance: string, token: string): Promise<Account> {
  const { mastodonHandleUrl } = await import("./integrations/mastodon.server");
  mastodonHandleUrl(`@user@${instance}`);
  const res = await timedFetch(`https://${instance}/api/v1/accounts/verify_credentials`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!res.ok) {
    throw new MastodonAuthError(
      "account_unverified",
      `${instance} would not confirm your account (HTTP ${res.status}).`,
    );
  }
  const json = (await res.json().catch(() => null)) as {
    id?: string;
    username?: string;
    display_name?: string;
    avatar?: string;
    url?: string;
  } | null;
  if (!json?.username || typeof json.id !== "string" || !/^\d+$/.test(json.id))
    throw new MastodonAuthError("account_unverified", `${instance} returned an empty profile.`);
  return {
    id: json.id,
    username: json.username,
    displayName: json.display_name || json.username,
    avatar: json.avatar ?? null,
    url: json.url ?? `https://${instance}/@${json.username}`,
  };
}

async function exchangeCode(state: StatePayload, code: string): Promise<string> {
  const res = await timedFetch(`https://${state.instance}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: state.clientId,
      client_secret: state.clientSecret,
      redirect_uri: state.redirectUri,
      scope: MASTODON_SCOPES,
      code,
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    mastodonLog("warn", "token_exchange_failed", {
      instance: state.instance,
      status: res.status,
      reason: json?.error ?? null,
    });
    throw new MastodonAuthError(
      "code_rejected",
      json?.error_description || json?.error || `${state.instance} rejected the authorization.`,
    );
  }
  return json.access_token;
}

/**
 * Maps the verified Fediverse account onto a ROUT account in Neon, creating it
 * on first sign-in. Returns the user id; the calling server function turns that
 * into the httpOnly session cookie, exactly like password sign-in does.
 */
async function mintNeonSession(instance: string, account: Account) {
  const { updateUserMetadata } = await import("./auth/users.server");
  const { mastodonSubject } = await import("./identity/link-rules");

  const subject = mastodonSubject(`https://${instance}`, String(account.id));
  const handle = fediverseHandle(account.username, instance);
  mastodonLog("info", "session_mint_started", { instance, handle });
  const metadata = {
    provider_kind: "mastodon",
    fediverse_handle: handle,
    fediverse_instance: instance,
    fediverse_url: account.url,
    full_name: account.displayName,
    avatar_url: account.avatar,
  };

  try {
    // 1. Al gekoppeld via een eerder bevestigd e-mailadres → meteen binnen.
    const { sql } = await import("./neon");
    const linked = (await sql`
      select user_id from public.user_identities
       where provider = 'mastodon' and provider_account_id = ${subject}
       limit 1`) as Record<string, unknown>[];
    let userId = linked[0]?.["user_id"] ? String(linked[0]["user_id"]) : null;
    // Mutable handles and synthetic emails are never identity ownership proof.
    // 3. Nieuw: eerst een e-mailadres + code — nooit stil een account maken.
    if (!userId) {
      mastodonLog("info", "email_step_required", { instance, handle });
      return { userId: null, handle, subject, displayName: account.displayName };
    }
    await updateUserMetadata(userId, metadata);
    mastodonLog("info", "session_minted", { instance, handle });
    return { userId, handle, subject, displayName: account.displayName };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    mastodonLog("error", "session_mint_failed", { instance, handle, reason });
    throw new MastodonAuthError("session_failed", "Could not start your session — try again.");
  }
}

/** Step 2: finish the flow for the callback route. */
export async function completeMastodonCallback(input: {
  code: string;
  state: string;
  cid?: string;
}) {
  const startedAt = Date.now();
  setMastodonCorrelationId(normalizeCorrelationId(input.cid));
  const state = await openState(input.state);
  // The sealed state carries the id minted in step 1 — prefer it so both legs
  // of the OAuth round-trip appear under one correlation id.
  const cid = setMastodonCorrelationId(
    normalizeCorrelationId(state.cid) ?? normalizeCorrelationId(input.cid),
  );
  mastodonLog("info", "callback_started", { instance: state.instance });
  const token = await exchangeCode(state, input.code);
  const account = await verifyCredentials(state.instance, token);
  const session = await mintNeonSession(state.instance, account);
  mastodonLog("info", "callback_completed", {
    instance: state.instance,
    handle: session.handle,
    durationMs: Date.now() - startedAt,
  });
  return { ...session, instance: state.instance, next: safePath(state.next), cid };
}
