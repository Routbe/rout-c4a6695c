/**
 * "Link this account to me" intent for the Bluesky/Mastodon flows.
 * The cookie only expresses intent; the callback still requires a valid ROUT
 * session and never moves an identity that belongs to another member.
 */
export const LINK_INTENT_COOKIE = "rout_link_intent";
const SETTINGS = "/studio/account?tab=identities";

export function linkIntentCookie(on: boolean) {
  return on
    ? `${LINK_INTENT_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`
    : clearLinkIntent();
}

export function clearLinkIntent() {
  return `${LINK_INTENT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

/** Returns a redirect target when the request was a link attempt, else null (normal sign-in). */
export async function maybeLinkToCurrentUser(
  request: Request,
  provider: "bluesky" | "mastodon",
  accountId: string,
  handle: string,
): Promise<string | null> {
  const cookie = request.headers.get("cookie") ?? "";
  if (!new RegExp(`(?:^|;\\s*)${LINK_INTENT_COOKIE}=1`).test(cookie)) return null;
  const { currentUser } = await import("@/lib/auth/session.server");
  const user = await currentUser().catch(() => null);
  if (!user) return null;
  const { attachIdentity } = await import("@/lib/identities.server");
  const result = await attachIdentity({ userId: String(user.id), provider, providerAccountId: accountId, displayName: handle });
  return result.ok ? `${SETTINGS}&linked=${provider}` : `${SETTINGS}&link_error=taken`;
}
