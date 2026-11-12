type UserWithMetadata = { user_metadata?: Record<string, unknown> | null };

/**
 * Google and GitHub both hand their profile picture to Postgres in the OAuth
 * metadata, but under different keys. This returns the first usable https URL
 * so a fresh member already has a real avatar before uploading anything.
 */
export function oauthAvatarOf(user: UserWithMetadata | null | undefined): string | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [meta["avatar_url"], meta["picture"], meta["photoURL"]];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^https?:\/\//.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  return null;
}
