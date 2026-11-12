/**
 * Envelope encryption for the private signing keys of "Login met ROUT".
 *
 * KEK  = ROUT_PROVIDER_SIGNING_KEK (>= 32 chars). Without it a KEK is derived
 *        from the auth secret so sign-ins keep working, with a warning.
 * DEK  = HMAC-SHA256(KEK, "rout:oidc-signing:v1:" + kid) — one key per kid.
 * Seal = AES-256-GCM(DEK, iv = 12 random bytes, aad = "rout:oidc-signing:v1:" + kid).
 *
 * Swapping a sealed blob onto another kid fails authentication (aad + DEK), and
 * the stored fingerprint tells which KEK sealed a row without revealing it.
 * WebCrypto only, so it runs on workerd and on Vercel alike.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const LABEL = "rout:oidc-signing:v1:";

export const KEK_ENV = "ROUT_PROVIDER_SIGNING_KEK";
export const MIN_KEK_LENGTH = 32;

const b64u = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (value: string): Uint8Array =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export type KekSource = "env" | "derived";
export type Kek = { material: string; source: KekSource };

let warnedDerived = false;

/** The current key-encryption key; reads process.env on every call. */
export async function currentKek(): Promise<Kek> {
  const own = (process.env[KEK_ENV] ?? "").trim();
  if (own.length >= MIN_KEK_LENGTH) return { material: own, source: "env" };
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const resolved = resolveAuthSecret();
  if (!resolved) throw new Error(`${KEK_ENV} ontbreekt en er is geen auth-secret om op terug te vallen.`);
  if (!warnedDerived) {
    warnedDerived = true;
    console.warn(`[oidc-keys] ${KEK_ENV} is not set; sealing signing keys with a KEK derived from the auth secret.`);
  }
  return { material: `derived:${resolved.secret}`, source: "derived" };
}

async function hmac(keyMaterial: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(keyMaterial), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** Non-secret identifier of a KEK (first 16 bytes of an HMAC, base64url). */
export async function kekFingerprint(kek: Kek): Promise<string> {
  return b64u((await hmac(kek.material, "rout:oidc-signing:fingerprint")).slice(0, 16));
}

async function dataKey(kek: Kek, kid: string): Promise<CryptoKey> {
  const raw = await hmac(kek.material, LABEL + kid);
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export type SealedPrivateKey = { sealed: string; iv: string; fingerprint: string };

export async function sealPrivateJwk(kid: string, jwk: JsonWebKey & { kid?: string }, kek: Kek): Promise<SealedPrivateKey> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(LABEL + kid) },
    await dataKey(kek, kid),
    enc.encode(JSON.stringify(jwk)),
  );
  return { sealed: b64u(new Uint8Array(ct)), iv: b64u(iv), fingerprint: await kekFingerprint(kek) };
}

export async function openPrivateJwk(kid: string, sealed: string, iv: string, kek: Kek): Promise<JsonWebKey> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64u(iv) as BufferSource, additionalData: enc.encode(LABEL + kid) },
    await dataKey(kek, kid),
    unb64u(sealed) as BufferSource,
  );
  return JSON.parse(dec.decode(pt)) as JsonWebKey;
}
