/** AES-GCM via WebCrypto (works on workerd and Vercel). Output: base64(iv|ciphertext). */
const enc = new TextEncoder();

async function keyFrom(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export async function encryptText(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(secret), enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function decryptText(stored: string, secret: string): Promise<string> {
  const buf = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, await keyFrom(secret), buf.subarray(12));
  return new TextDecoder().decode(pt);
}

export async function keyedHash(value: string, secret: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(`${secret}:${value}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
