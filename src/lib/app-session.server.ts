/**
 * Eigen sessiecookie voor aanmeldwijzen die niet via Neon Auth lopen
 * (vandaag: Bluesky). De cookie bevat alleen het ROUT-gebruikers-id plus een
 * vervaltijd, ondertekend met HMAC-SHA256 — hij kan dus niet vervalst worden.
 *
 * Neon Auth blijft de hoofdingang: `currentUser()` kijkt daar eerst en valt
 * pas daarna op deze cookie terug.
 */

export const APP_SESSION_COOKIE = "rout_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret(): string {
  // Never fall back to DATABASE_URL: a leaked DB URL must not let anyone forge sessions.
  const value = process.env["APP_SESSION_SECRET"] || process.env["NEON_AUTH_COOKIE_SECRET"];
  if (!value) throw new Error("APP_SESSION_SECRET ontbreekt.");
  return value;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  view.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload) as BufferSource,
  );
  return b64url(mac);
}

export async function createAppSessionValue(userId: string): Promise<string> {
  const payload = `${userId}.${Date.now() + MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${await sign(payload)}`;
}

export async function readAppSessionUserId(cookieHeader: string): Promise<string | null> {
  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${APP_SESSION_COOKIE}=`));
  if (!raw) return null;
  const value = decodeURIComponent(raw.slice(APP_SESSION_COOKIE.length + 1));
  const [userId, expires, mac] = value.split(".");
  if (!userId || !expires || !mac) return null;
  if (Number(expires) < Date.now()) return null;
  const expected = await sign(`${userId}.${expires}`);
  if (expected.length !== mac.length) return null;
  let diff = 0;
  for (let i = 0; i < mac.length; i += 1) diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  return diff === 0 ? userId : null;
}

export const APP_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

/**
 * Kleine ondertekende waarde voor korte tussenstappen (bv. een geverifieerd
 * Bluesky-account dat nog op een e-mailadres wacht).
 */
export async function signValue(payload: string, ttlMs = 15 * 60 * 1000): Promise<string> {
  const body = `${payload}~${Date.now() + ttlMs}`;
  return `${body}~${await sign(body)}`;
}

export async function readSignedValue(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const parts = value.split("~");
  if (parts.length !== 3) return null;
  const [payload, expires, mac] = parts as [string, string, string];
  if (Number(expires) < Date.now()) return null;
  const expected = await sign(`${payload}~${expires}`);
  return expected === mac ? payload : null;
}

export function readCookie(cookieHeader: string, name: string): string | null {
  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return raw ? decodeURIComponent(raw.slice(name.length + 1)) : null;
}
