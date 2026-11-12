/**
 * Bluesky (AT Protocol) OAuth — server side.
 *
 * Bluesky heeft geen centrale OAuth-server: elk account woont op zijn eigen
 * PDS, met een eigen authorization server. De flow is daarom:
 *
 *   handle → DID → PDS → protected-resource metadata → authorization server
 *   → pushed authorization request (PAR, met DPoP) → toestemming bij Bluesky
 *   → callback → tokenruil (met DPoP + PKCE) → geverifieerde DID + handle.
 *
 * Alles wat tussen de twee stappen bewaard moet blijven (PKCE-verifier en de
 * DPoP-sleutel) reist versleuteld mee in een httpOnly cookie; er is dus geen
 * serverstatus nodig.
 */

const FETCH_TIMEOUT_MS = 8000;
export const BLUESKY_SCOPE = "atproto transition:generic";

export class BlueskyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlueskyAuthError";
  }
}

/* --------------------------------------------------------------- helpers */

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  view.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(bytes))));
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new BlueskyAuthError(`Kon ${new URL(url).host} niet bereiken.`);
  } finally {
    clearTimeout(timer);
  }
}

async function json<T>(res: Response): Promise<T | null> {
  return (await res.json().catch(() => null)) as T | null;
}

/* ------------------------------------------------------------------ DPoP */

type DpopKey = { privateKey: CryptoKey; publicJwk: JsonWebKey };

async function newDpopKey(): Promise<DpopKey> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    privateKey: pair.privateKey,
    publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
  };
}

async function importDpopKey(privateJwk: JsonWebKey, publicJwk: JsonWebKey): Promise<DpopKey> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  return { privateKey, publicJwk };
}

async function exportPrivateJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

async function dpopProof(
  key: DpopKey,
  method: string,
  url: string,
  nonce?: string | null,
): Promise<string> {
  const header = { typ: "dpop+jwt", alg: "ES256", jwk: key.publicJwk };
  const payload: Record<string, unknown> = {
    jti: randomString(16),
    htm: method,
    htu: url.split("?")[0],
    iat: Math.floor(Date.now() / 1000),
  };
  if (nonce) payload["nonce"] = nonce;
  const encoder = new TextEncoder();
  const signingInput = `${b64url(encoder.encode(JSON.stringify(header)))}.${b64url(
    encoder.encode(JSON.stringify(payload)),
  )}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key.privateKey,
    encoder.encode(signingInput) as BufferSource,
  );
  return `${signingInput}.${b64url(signature)}`;
}

/** POST met automatische herhaling zodra de server om een DPoP-nonce vraagt. */
async function dpopPost(
  key: DpopKey,
  url: string,
  body: URLSearchParams,
  nonce?: string | null,
): Promise<{ res: Response; body: Record<string, unknown> | null; nonce: string | null }> {
  const send = async (useNonce: string | null | undefined) => {
    const res = await timedFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        dpop: await dpopProof(key, "POST", url, useNonce),
      },
      body,
    });
    return res;
  };

  let res = await send(nonce);
  let nextNonce = res.headers.get("dpop-nonce");
  if (res.status >= 400 && nextNonce) {
    res = await send(nextNonce);
    nextNonce = res.headers.get("dpop-nonce") ?? nextNonce;
  }
  return { res, body: await json<Record<string, unknown>>(res), nonce: nextNonce };
}

/* ------------------------------------------------------- identity lookup */

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

async function resolveDid(handle: string): Promise<string> {
  if (handle.startsWith("did:")) return handle;
  const res = await timedFetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  const data = await json<{ did?: string }>(res);
  if (!res.ok || !data?.did) {
    throw new BlueskyAuthError(`De handle "${handle}" bestaat niet op Bluesky.`);
  }
  return data.did;
}

type DidDoc = {
  alsoKnownAs?: string[];
  service?: { id?: string; type?: string; serviceEndpoint?: string }[];
};

async function resolveDidDoc(did: string): Promise<DidDoc> {
  const url = did.startsWith("did:web:")
    ? `https://${decodeURIComponent(did.slice("did:web:".length))}/.well-known/did.json`
    : `https://plc.directory/${encodeURIComponent(did)}`;
  const res = await timedFetch(url);
  const doc = await json<DidDoc>(res);
  if (!res.ok || !doc) throw new BlueskyAuthError("Kon het Bluesky-account niet opzoeken.");
  return doc;
}

function pdsFromDoc(doc: DidDoc): string {
  const service = (doc.service ?? []).find(
    (s) => s.type === "AtprotoPersonalDataServer" && s.serviceEndpoint,
  );
  if (!service?.serviceEndpoint) {
    throw new BlueskyAuthError("Dit Bluesky-account heeft geen bereikbare server.");
  }
  return service.serviceEndpoint.replace(/\/$/, "");
}

function handleFromDoc(doc: DidDoc): string | null {
  const aka = (doc.alsoKnownAs ?? []).find((v) => v.startsWith("at://"));
  return aka ? aka.slice("at://".length) : null;
}

type AuthServerMeta = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  pushed_authorization_request_endpoint?: string;
};

/**
 * Authorization servers we are willing to send a visitor's browser to. The
 * handle/DID/PDS chain is caller-controlled, so the discovered issuer (and
 * every endpoint it advertises) must be on this list — otherwise a crafted
 * handle could turn our sign-in route into an open redirect to a look-alike
 * consent page. Extra self-hosted servers can be allowed via the
 * comma-separated `BLUESKY_ALLOWED_AUTH_SERVERS` env var (https origins only).
 */
const DEFAULT_BLUESKY_AUTH_SERVERS = ["https://bsky.social"] as const;

function httpsOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function allowedBlueskyAuthServers(): string[] {
  const extra = (process.env["BLUESKY_ALLOWED_AUTH_SERVERS"] ?? "")
    .split(",")
    .map((v) => httpsOrigin(v))
    .filter((v): v is string => Boolean(v));
  return [...new Set([...DEFAULT_BLUESKY_AUTH_SERVERS, ...extra])];
}

/** True when `url` is an https URL on one of the approved authorization servers. */
export function isApprovedBlueskyAuthUrl(url: string): boolean {
  const origin = httpsOrigin(url);
  return Boolean(origin && allowedBlueskyAuthServers().includes(origin));
}

async function authServerFor(pds: string): Promise<AuthServerMeta> {
  const prRes = await timedFetch(`${pds}/.well-known/oauth-protected-resource`);
  const pr = await json<{ authorization_servers?: string[] }>(prRes);
  const issuer = pr?.authorization_servers?.[0];
  if (!issuer) throw new BlueskyAuthError("Deze Bluesky-server ondersteunt geen OAuth-login.");
  const issuerOrigin = httpsOrigin(issuer);
  if (!issuerOrigin || !allowedBlueskyAuthServers().includes(issuerOrigin)) {
    throw new BlueskyAuthError("Deze Bluesky-server wordt (nog) niet ondersteund voor aanmelden.");
  }
  const metaRes = await timedFetch(`${issuerOrigin}/.well-known/oauth-authorization-server`);
  const meta = await json<AuthServerMeta>(metaRes);
  if (!meta?.authorization_endpoint || !meta.token_endpoint) {
    throw new BlueskyAuthError("Deze Bluesky-server gaf geen geldige OAuth-instellingen terug.");
  }
  // Every advertised endpoint must live on the same approved issuer origin.
  const sameIssuer = (u: string | undefined) => httpsOrigin(u) === issuerOrigin;
  if (
    httpsOrigin(meta.issuer) !== issuerOrigin ||
    !sameIssuer(meta.authorization_endpoint) ||
    !sameIssuer(meta.token_endpoint) ||
    (meta.pushed_authorization_request_endpoint !== undefined &&
      !sameIssuer(meta.pushed_authorization_request_endpoint))
  ) {
    throw new BlueskyAuthError("Deze Bluesky-server gaf geen geldige OAuth-instellingen terug.");
  }
  return meta;
}

/* --------------------------------------------------------------- state */

export type BlueskyState = {
  state: string;
  verifier: string;
  tokenEndpoint: string;
  issuer: string;
  did: string;
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
  nonce: string | null;
  next: string;
  exp: number;
};

async function stateKey(): Promise<CryptoKey> {
  const secret =
    process.env["APP_SESSION_SECRET"] ||
    process.env["NEON_AUTH_COOKIE_SECRET"] ||
    process.env["DATABASE_URL"];
  if (!secret) throw new BlueskyAuthError("Bluesky-login is nog niet geconfigureerd.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret) as BufferSource);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealBlueskyState(payload: BlueskyState): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await stateKey(),
      new TextEncoder().encode(JSON.stringify(payload)) as BufferSource,
    ),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return b64url(out);
}

export async function openBlueskyState(sealed: string): Promise<BlueskyState> {
  try {
    const padded = sealed.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const raw = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) raw[i] = binary.charCodeAt(i);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.subarray(0, 12) as BufferSource },
      await stateKey(),
      raw.subarray(12) as BufferSource,
    );
    const payload = JSON.parse(new TextDecoder().decode(plain)) as BlueskyState;
    if (!payload.exp || payload.exp < Date.now()) {
      throw new Error("expired");
    }
    return payload;
  } catch {
    throw new BlueskyAuthError("Deze inlogpoging is verlopen. Probeer opnieuw.");
  }
}

/* ----------------------------------------------------------------- flow */

/**
 * Bluesky servers must fetch our client-metadata.json over public HTTPS.
 * Private preview hosts and localhost cannot be reached → explain instead of a vague rejection.
 */
export function blueskyOriginProblem(origin: string): string | null {
  let host = "";
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return "Bluesky-login werkt alleen via een publiek https-adres.";
    host = u.hostname;
  } catch {
    return "Het app-adres (NEXT_PUBLIC_APP_URL) is ongeldig.";
  }
  if (host === "localhost" || host.startsWith("id-preview--")) {
    return "Bluesky-login werkt niet in de privé-preview: Bluesky kan ons client-metadata-bestand daar niet ophalen. Test op de gepubliceerde site.";
  }
  return null;
}

export function blueskyClientId(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/bluesky/client-metadata.json`;
}

export function blueskyRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/bluesky/callback`;
}

/** Stap 1: bouw de Bluesky-toestemmings-URL en de bijbehorende state. */
export async function startBlueskyLogin(input: {
  handle: string;
  origin: string;
  next?: string;
}): Promise<{ url: string; state: BlueskyState }> {
  const handle = normalizeHandle(input.handle);
  if (!handle || !/^[a-z0-9.:_-]+$/.test(handle)) {
    throw new BlueskyAuthError("Vul een geldige Bluesky-handle in, bijvoorbeeld naam.bsky.social.");
  }
  const did = await resolveDid(handle);
  const doc = await resolveDidDoc(did);
  const meta = await authServerFor(pdsFromDoc(doc));

  const key = await newDpopKey();
  const verifier = randomString(48);
  const challenge = b64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier) as BufferSource),
  );
  const state = randomString(24);
  const clientId = blueskyClientId(input.origin);
  const redirectUri = blueskyRedirectUri(input.origin);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: BLUESKY_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: handle,
  });

  let requestUri: string | null = null;
  let nonce: string | null = null;

  if (meta.pushed_authorization_request_endpoint) {
    const par = await dpopPost(key, meta.pushed_authorization_request_endpoint, params);
    nonce = par.nonce;
    const uri = par.body?.["request_uri"];
    if (!par.res.ok || typeof uri !== "string") {
      console.error("[bluesky] PAR rejected", {
        status: par.res.status,
      });
      throw new BlueskyAuthError("Er is een tijdelijk verbindingsprobleem opgetreden.");
    }
    requestUri = uri;
  }

  const authorizeUrl = requestUri
    ? `${meta.authorization_endpoint}?${new URLSearchParams({ client_id: clientId, request_uri: requestUri }).toString()}`
    : `${meta.authorization_endpoint}?${params.toString()}`;

  return {
    url: authorizeUrl,
    state: {
      state,
      verifier,
      tokenEndpoint: meta.token_endpoint,
      issuer: meta.issuer,
      did,
      privateJwk: await exportPrivateJwk(key.privateKey),
      publicJwk: key.publicJwk,
      nonce,
      next: input.next && input.next.startsWith("/") ? input.next : "/dashboard",
      exp: Date.now() + 10 * 60 * 1000,
    },
  };
}

/** Stap 2: wissel de code in en lever de geverifieerde DID + handle op. */
export async function completeBlueskyLogin(input: {
  code: string;
  state: BlueskyState;
  origin: string;
}): Promise<{ did: string; handle: string; next: string }> {
  const key = await importDpopKey(input.state.privateJwk, input.state.publicJwk);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: blueskyRedirectUri(input.origin),
    client_id: blueskyClientId(input.origin),
    code_verifier: input.state.verifier,
  });
  const token = await dpopPost(key, input.state.tokenEndpoint, body, input.state.nonce);
  const sub = token.body?.["sub"];
  if (!token.res.ok || typeof sub !== "string") {
    console.error("[bluesky] token exchange failed", {
      status: token.res.status,
    });
    throw new BlueskyAuthError("Er is een tijdelijk verbindingsprobleem opgetreden.");
  }
  if (sub !== input.state.did) {
    throw new BlueskyAuthError("Er is ingelogd met een ander Bluesky-account dan gevraagd.");
  }
  const doc = await resolveDidDoc(sub);
  return { did: sub, handle: handleFromDoc(doc) ?? sub, next: input.state.next };
}
