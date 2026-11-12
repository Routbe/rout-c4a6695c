/**
 * Opaque one-time tokens (sessions, merge links, e-mail safety links).
 * Only the SHA-256 digest of a token is ever stored. ROUT has no passwords.
 */
function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Opaque, URL-safe secret used for sessions and one-time tokens. */
export function generateToken(bytes = 32): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Only the SHA-256 digest of a token is ever stored in the database. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64(new Uint8Array(digest));
}
