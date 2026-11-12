/**
 * Account Genesis stamp + Early Believer badge id (pure, WebCrypto).
 * HMAC over the user id and registration time with a server secret: deterministic,
 * unforgeable without the secret, and reveals nothing about the user.
 */
const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function group(hex: string, prefix: string): string {
  const s = hex.slice(0, 12).toUpperCase();
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export async function genesisStamp(secret: string, userId: string, createdAtIso: string): Promise<string> {
  return group(await hmacHex(secret, `genesis:${userId}:${new Date(createdAtIso).toISOString()}`), "RG");
}

export async function earlyBelieverId(secret: string, userId: string): Promise<string> {
  return group(await hmacHex(secret, `early-believer:${userId}`), "EB");
}
