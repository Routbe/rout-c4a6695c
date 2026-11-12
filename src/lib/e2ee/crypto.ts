// Client-side E2EE core (Web Crypto only). The server never sees DEKs or plaintext.
import { wipe } from "@/lib/crypto/wipe";
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = {
  encode(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(str: string): Uint8Array {
    const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

/** Fixed salt for the WebAuthn PRF extension; output is device/credential bound. */
export const PRF_SALT = enc.encode("rout.e2ee.prf.v1");

/** HKDF-SHA256 → non-extractable AES-256-GCM key. `ikm` = PRF output or recovery master key. */
export async function deriveDek(ikm: Uint8Array, info = "rout.e2ee.dek.v1"): Promise<CryptoKey> {
  const owned = new Uint8Array(ikm);
  try {
    const base = await crypto.subtle.importKey("raw", owned, "HKDF", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("rout.e2ee.salt.v1"), info: enc.encode(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
  } finally {
    wipe(owned);
  }
}

export type SealedBlob = `v1.${string}.${string}`;

/** AES-256-GCM seal with a random 96-bit IV; `aad` binds the blob to e.g. user id + field. */
export async function seal(key: CryptoKey, data: unknown, aad: string): Promise<SealedBlob> {
  const plaintext = enc.encode(JSON.stringify(data));
  try {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    plaintext,
  );
  return `v1.${b64u.encode(iv)}.${b64u.encode(new Uint8Array(ct))}`;
  } finally {
    wipe(plaintext);
  }
}

export async function open<T = unknown>(key: CryptoKey, blob: string, aad: string): Promise<T> {
  const [v, iv, ct] = blob.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unsupported blob format");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64u.decode(iv) as BufferSource, additionalData: enc.encode(aad) },
    key,
    b64u.decode(ct) as BufferSource,
  );
  try {
    return JSON.parse(dec.decode(pt)) as T;
  } finally {
    wipe(pt);
  }
}

/** Server-side guard: accept only well-formed ciphertext for blind columns. */
export function isSealedBlob(v: unknown): v is SealedBlob {
  return typeof v === "string" && v.length < 65536 && /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/.test(v);
}

/** Read the PRF secret from a passkey assertion (browser only). Null when unsupported. */
export async function passkeyPrfSecret(options: PublicKeyCredentialRequestOptions): Promise<Uint8Array | null> {
  const cred = (await navigator.credentials.get({
    publicKey: { ...options, extensions: { ...(options.extensions ?? {}), prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs },
  })) as PublicKeyCredential | null;
  const res = cred?.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } } | undefined;
  const first = res?.prf?.results?.first;
  return first ? new Uint8Array(first) : null;
}
