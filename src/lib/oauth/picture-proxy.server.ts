/**
 * Per-app profile photo proxy for "Login met ROUT".
 * The `picture` claim is `/api/public/oauth/picture?c=<client>&t=<token>`, where the token
 * seals { user, avatar path } bound to that client (AES-GCM, fresh IV). Two apps therefore
 * never receive the same URL, the URL never contains the account id, and it stops working
 * as soon as the member revokes the app.
 */
import { avatarPathOf, openText, sealText } from "@/lib/auth/public-ref.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const aadFor = (clientId: string) => `picture:${clientId}`;

export async function appPictureUrl(avatarUrl: unknown, userId: string, clientId: string | null, origin: string): Promise<string | null> {
  if (typeof avatarUrl !== "string" || !avatarUrl || !clientId) return null;
  const path = avatarPathOf(avatarUrl);
  if (!path) {
    // Non-ROUT image URLs are shared only when they reveal no account id.
    return /^https:\/\//i.test(avatarUrl) && !avatarUrl.toLowerCase().includes(userId.toLowerCase()) ? avatarUrl : null;
  }
  const token = await sealText(JSON.stringify({ u: userId, p: path }), aadFor(clientId));
  if (!token) return null;
  return `${origin}/api/public/oauth/picture?c=${encodeURIComponent(clientId)}&t=${token}`;
}

export async function openAppPicture(clientId: string, token: string): Promise<{ userId: string; path: string } | null> {
  if (!clientId || clientId.length > 200) return null;
  const plain = await openText(token, aadFor(clientId));
  if (!plain) return null;
  try {
    const v = JSON.parse(plain) as { u?: unknown; p?: unknown };
    if (typeof v.u !== "string" || !UUID.test(v.u) || typeof v.p !== "string") return null;
    // The photo must still belong to that member.
    if (!v.p.toLowerCase().startsWith(`${v.u.toLowerCase()}/`)) return null;
    return { userId: v.u, path: v.p };
  } catch {
    return null;
  }
}
