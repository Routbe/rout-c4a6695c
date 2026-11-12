/**
 * Sovereign Key material (server-only). Everything is HMAC(WALLET_ID_SECRET) over
 * the account id with its own label, so the key's serial and token can neither be
 * computed from, nor linked to, the member's root or alias card numbers.
 * Without a strong secret there is no key pass at all (fails closed).
 */
import { KEY_TOTP_DIGITS, KEY_TOTP_PERIOD_MS, type WalletKeyPayload } from "./wallet-key";
import { generationLabel } from "./card-lifecycle";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mac(secret: string, label: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(label)));
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Builds the key for one account; `now` makes every issue/sync carry a fresh token. */
export async function walletKeyPayload(accountId: string, secret: string | undefined, now = Date.now(), generation = 0): Promise<WalletKeyPayload | null> {
  if (!secret || secret.length < 32 || !accountId) return null;
  // A replaced card gets a new key id; generation 0 keeps the original key.
  const id = hex(await mac(secret, `rout-key:v1:id:${accountId}${generationLabel(generation)}`)).slice(0, 16);
  const issued = Math.floor(now / 1000).toString(36);
  const sig = b64url(await mac(secret, `rout-key:v1:tap:${id}:${issued}`)).slice(0, 27);
  const totp = { keyId: id, secretHex: await keyTotpSecret(id, secret) };
  return { serial: `key_${id}`, token: `rk1.${id}.${issued}.${sig}`, label: id.slice(-4).toUpperCase(), totp };
}

/** Per-key TOTP secret (20 bytes, Base16) for Google's rotating QR; derivable from the key id only server-side. */
async function keyTotpSecret(keyId: string, secret: string): Promise<string> {
  return hex(await mac(secret, `rout-key:v1:totp:${keyId}`)).slice(0, 40);
}

/** RFC 6238 TOTP (HMAC-SHA1, big-endian step counter), as Google Wallet computes it. */
export async function totpAt(secretHex: string, step: number, digits = KEY_TOTP_DIGITS): Promise<string> {
  const keyBytes = new Uint8Array((secretHex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
  const counter = new Uint8Array(8);
  let n = step;
  for (let i = 7; i >= 0; i--) { counter[i] = n & 0xff; n = Math.floor(n / 256); }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const o = h[h.length - 1]! & 0x0f;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/**
 * Checks a scanned `rout:wk:<key id>:<digits>` code: the current or the previous
 * 60 s step (clock drift). Single use is enforced by the caller via the step.
 */
export async function verifyWalletKeyQr(payload: string, secret: string | undefined, now = Date.now()): Promise<{ ok: true; keyId: string; step: number } | { ok: false }> {
  const m = new RegExp(`^rout:wk:([0-9a-f]{16}):([0-9]{${KEY_TOTP_DIGITS}})$`).exec(payload.trim());
  if (!m || !secret || secret.length < 32) return { ok: false };
  const keyId = m[1]!;
  const secretHex = await keyTotpSecret(keyId, secret);
  const current = Math.floor(now / KEY_TOTP_PERIOD_MS);
  for (const step of [current, current - 1]) {
    const expected = await totpAt(secretHex, step);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ m[2]!.charCodeAt(i);
    if (diff === 0) return { ok: true, keyId, step };
  }
  return { ok: false };
}

/** Single-use marker for one key + step, in the used-nonce format (22 base64url chars). */
export async function walletKeyQrNonce(keyId: string, step: number): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`rout-key:v1:qr-used:${keyId}:${step}`)));
  return b64url(digest).slice(0, 22);
}

/** Constant-time check of a token presented by a reader (for the future reader endpoint). */
export async function verifyWalletKeyToken(token: string, secret: string | undefined): Promise<{ ok: true; keyId: string; issuedAt: number } | { ok: false }> {
  const m = /^rk1\.([0-9a-f]{16})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{27})$/.exec(token);
  if (!m || !secret || secret.length < 32) return { ok: false };
  const expected = b64url(await mac(secret, `rout-key:v1:tap:${m[1]}:${m[2]}`)).slice(0, 27);
  let diff = 0;
  for (let i = 0; i < 27; i++) diff |= expected.charCodeAt(i) ^ m[3]!.charCodeAt(i);
  return diff === 0 ? { ok: true, keyId: m[1]!, issuedAt: parseInt(m[2]!, 36) * 1000 } : { ok: false };
}
