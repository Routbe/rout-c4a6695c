/**
 * Client-secret hashing. New secrets: "v2$" + base64url(sha256(pepper + secret)).
 * Older rows hold a plain sha256(secret) and keep working until rotated.
 */
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha(value: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));
}

export function generateClientSecret(): string {
  return `routsec_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export async function hashClientSecret(secret: string, pepper: string): Promise<string> {
  return `v2$${await sha(pepper + secret)}`;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function verifyClientSecret(secret: string, stored: string, pepper: string): Promise<boolean> {
  const candidate = stored.startsWith("v2$") ? await hashClientSecret(secret, pepper) : await sha(secret);
  return constantTimeEqual(candidate, stored);
}
