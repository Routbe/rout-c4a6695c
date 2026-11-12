/**
 * One-click "Was jij dit niet?" revoke token for identity links.
 * token = <linkId>.<base64url(HMAC-SHA256(secret, "identity-revoke:" || linkId))>
 * Pure (WebCrypto only) so it is testable and browser-safe; the secret stays server-side.
 */
const enc = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mac(secret: string, linkId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`identity-revoke:${linkId}`))));
}

export async function createRevokeToken(secret: string, linkId: string): Promise<string> {
  if (!UUID.test(linkId)) throw new Error("invalid_link_id");
  return `${linkId}.${await mac(secret, linkId)}`;
}

/** Returns the link id when the token is authentic, otherwise null (constant-length compare). */
export async function verifyRevokeToken(secret: string, token: string): Promise<string | null> {
  const [linkId, sig, extra] = token.split(".");
  if (!linkId || !sig || extra !== undefined || !UUID.test(linkId)) return null;
  const expected = await mac(secret, linkId);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? linkId : null;
}
