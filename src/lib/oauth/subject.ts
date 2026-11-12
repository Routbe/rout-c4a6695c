/** Pass the secret from server code only; this module never reads environment variables. */
export async function pairwiseSubject(secret: string, sectorId: string, userId: string): Promise<string> {
  if (secret.length < 32 || !sectorId || !userId) throw new Error("invalid_pairwise_input");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(sectorId + userId));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function redirectSector(redirectUri: string): string {
  const url = new URL(redirectUri);
  if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) throw new Error("invalid_sector");
  return url.host.toLowerCase();
}