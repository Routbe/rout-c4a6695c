/**
 * Encryption for signup-block addresses. WebCrypto only (runs on Workers).
 *
 * - The key lives outside the database (`SUBSCRIBER_ENCRYPTION_KEY`), so a
 *   database dump alone reveals no address.
 * - Ciphertext is bound to the owner and space (AES-GCM additional data): a
 *   row copied to another profile does not decrypt.
 * - De-duplication uses a keyed HMAC, never a plain hash of the address.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

export function subscriberKeyConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env["SUBSCRIBER_ENCRYPTION_KEY"] ?? "").trim().length >= 32;
}

function rawKey(): string {
  const raw = (process.env["SUBSCRIBER_ENCRYPTION_KEY"] ?? "").trim();
  if (raw.length < 32) throw new Error("subscriber_key_missing");
  return raw;
}

async function aesKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`rout-subscriber-aes-v1:${rawKey()}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(`rout-subscriber-hash-v1:${rawKey()}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

const aad = (ownerId: string, space: string) => enc.encode(`subscriber:${ownerId}:${space}`);

export async function sealSubscriberEmail(email: string, ownerId: string, space: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(ownerId, space) }, await aesKey(), enc.encode(email));
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv) };
}

export async function openSubscriberEmail(ciphertext: string, iv: string, ownerId: string, space: string): Promise<string | null> {
  if (!ciphertext || !iv) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: aad(ownerId, space) }, await aesKey(), unb64(ciphertext));
    return dec.decode(pt);
  } catch {
    return null;
  }
}

export async function subscriberEmailHash(email: string): Promise<string> {
  return hex(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(email.trim().toLowerCase())));
}

/** Random url-safe token for links in mails; only its SHA-256 is stored. */
export async function newSubscriberToken(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token, hash: await subscriberTokenHash(token) };
}

export async function subscriberTokenHash(token: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(token)));
}
