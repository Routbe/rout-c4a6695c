/**
 * AES-256-GCM encryption for third-party secrets (BYOK PSP keys).
 * WebCrypto only, so it runs on every server runtime. The key is derived from
 * `PSP_ENCRYPTION_KEY`; without it nothing is stored or decrypted.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function encryptionConfigured(): boolean {
  return (process.env["PSP_ENCRYPTION_KEY"] ?? "").length >= 32;
}

async function key(): Promise<CryptoKey> {
  const raw = process.env["PSP_ENCRYPTION_KEY"] ?? "";
  if (raw.length < 32) throw new Error("PSP_ENCRYPTION_KEY ontbreekt");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`rout-psp-v1:${raw}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(plain: string, aad: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, await key(), enc.encode(plain));
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv) };
}

export async function open(ciphertext: string, iv: string, aad: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv), additionalData: enc.encode(aad) },
    await key(),
    unb64(ciphertext),
  );
  return dec.decode(pt);
}
