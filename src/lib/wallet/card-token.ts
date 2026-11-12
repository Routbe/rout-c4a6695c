/**
 * Secure QR token for the back of the ROUT Card (v3). Pure WebCrypto, no I/O.
 *
 * token = base64url(JSON payload) "." base64url(HMAC-SHA256(key, "rout-card-qr:v3|" + payload))
 * payload = { v: 3, h: handle, s: "r"|"a", c: card tag, iat: ms, exp: ms, n: 128-bit nonce }
 * The card tag binds the token to one card number: after a replacement an
 * unused token of the old card never verifies against the new one.
 * Lifetime is exactly 60 s; the nonce makes every token single-use once the
 * server records it (see card_token_uses). Signature checks are constant time.
 */
export const SECURE_TTL_MS = 60_000;
/** The client fetches a fresh token this often, so a token never runs out on screen. */
export const SECURE_ROTATE_MS = 45_000;
const CLOCK_SKEW_MS = 5_000;
const HANDLE = /^[\w.-]{1,100}$/;
const NONCE = /^[A-Za-z0-9_-]{22}$/;
const CARD_TAG = /^[0-9a-f]{16}$/;

export type SecurePayload = { v: 3; h: string; s: "r" | "a"; c: string; iat: number; exp: number; n: string };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function mac(key: Uint8Array, body: string): Promise<Uint8Array> {
  if (key.byteLength < 32) throw new Error("token key too short");
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`rout-card-qr:v3|${body}`)));
}

export function newNonce(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function signSecureToken(key: Uint8Array, p: { handle: string; space: "root" | "alias"; card: string; now: number; nonce?: string }): Promise<{ token: string; payload: SecurePayload }> {
  const h = p.handle.replace(/^@/, "").toLowerCase();
  if (!HANDLE.test(h)) throw new Error("invalid handle");
  if (!CARD_TAG.test(p.card)) throw new Error("invalid card tag");
  const payload: SecurePayload = { v: 3, h, s: p.space === "alias" ? "a" : "r", c: p.card, iat: p.now, exp: p.now + SECURE_TTL_MS, n: p.nonce ?? newNonce() };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return { token: `${body}.${b64url(await mac(key, body))}`, payload };
}

export type TokenCheck = { ok: true; payload: SecurePayload } | { ok: false; reason: "invalid" | "expired" };

export async function verifySecureToken(key: Uint8Array, token: string, now: number): Promise<TokenCheck> {
  const parts = token.trim().split(".");
  if (parts.length !== 2 || parts[0]!.length > 400) return { ok: false, reason: "invalid" };
  const [body, sig] = parts as [string, string];
  const given = fromB64url(sig);
  const expected = await mac(key, body);
  // Constant time: always compare the full length.
  let d = (given?.length ?? 0) ^ expected.length;
  for (let i = 0; i < expected.length; i++) d |= expected[i]! ^ (given?.[i] ?? 0);
  if (d !== 0) return { ok: false, reason: "invalid" };
  let p: SecurePayload;
  try {
    p = JSON.parse(new TextDecoder().decode(fromB64url(body)!)) as SecurePayload;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (p.v !== 3 || !HANDLE.test(p.h) || typeof p.c !== "string" || !CARD_TAG.test(p.c) || (p.s !== "r" && p.s !== "a") || !NONCE.test(p.n) || !Number.isSafeInteger(p.iat) || p.exp !== p.iat + SECURE_TTL_MS) {
    return { ok: false, reason: "invalid" };
  }
  if (p.iat > now + CLOCK_SKEW_MS || now > p.exp) return { ok: false, reason: "expired" };
  return { ok: true, payload: p };
}

/** Payment/access QR on the back of the ROUT Card: a machine token, never a web link. */
export const ACCESS_PREFIX = "rout:access:";

export function accessPayload(token: string): string {
  return `${ACCESS_PREFIX}${token}`;
}

/** Scanner input → raw token. Web/profile URLs are always refused. */
export function parseAccessPayload(input: string): { ok: true; token: string } | { ok: false; reason: "web_url" | "invalid" } {
  const s = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(www\.)?rout\.be\b/i.test(s)) return { ok: false, reason: "web_url" };
  if (!s.startsWith(ACCESS_PREFIX)) return { ok: false, reason: "invalid" };
  const token = s.slice(ACCESS_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{40,}$/.test(token) || token.length > 600) return { ok: false, reason: "invalid" };
  return { ok: true, token };
}
