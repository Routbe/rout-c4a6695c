import { sql } from "./neon";
import { socialHandleKey, publicFollowerCount } from "./social-block-rules";
import type { PublicSocialLink } from "./social-verify";
export async function readSocialBlockLinks(profileId: string): Promise<PublicSocialLink[]> {
  const rows = await sql`
    select platform, username, follower_count, coalesce(last_synced_at, verified_at) as checked_at from public.social_links where profile_id = ${profileId} and is_verified = true
    union all
    select provider as platform, handle as username, coalesce(follower_count, manual_follower_count) as follower_count, coalesce(reach_synced_at, verified_at, updated_at) as checked_at
    from public.user_integrations where user_id = ${profileId} and verified = true
      and (provider <> 'youtube' or connection_status = 'connected')`;
  const settings = await sql`select platform, handle, show_followers from public.social_block_settings where profile_id = ${profileId}`;
  const { BLOCK_KINDS, blockHref } = await import("./profile");
  return rows.filter(r => BLOCK_KINDS.some(b => b.kind === r["platform"])).map(r => {
    const platform = String(r["platform"]);
    const username = String(r["username"]);
    const enabled = settings.some(s => s["platform"] === platform && s["handle"] === socialHandleKey(username) && s["show_followers"] === true);
    return { platform: platform as PublicSocialLink["platform"], username, url: blockHref({ kind: platform, value: username } as Parameters<typeof blockHref>[0]), isVerified: true, followerCount: publicFollowerCount(true, enabled, r["follower_count"] == null ? null : Number(r["follower_count"])), lastSyncedAt: r["checked_at"] ? new Date(r["checked_at"] as string).toISOString() : null };
  });
}
export async function socialBlockStatus(userId: string, platform: string, handle: string) {
  // Identity lookup proves typed handles; it never accepts a client verification flag.
  if (["github", "gitlab", "bluesky", "wsocial", "mastodon"].includes(platform) && handle.trim()) {
    const { ssoHandles, saveMine } = await import("./integrations.server");
    const identities = await ssoHandles(userId);
    if (identities[platform] && socialHandleKey(identities[platform]) === socialHandleKey(handle)) {
      const existing = await sql`select provider from public.user_integrations where user_id = ${userId} and provider = ${platform}`;
      if (!existing.length) await saveMine(userId, { provider: platform, handle, audience: "both", visible: false });
      else await sql`update public.user_integrations set verified = true, verified_via = 'sso' where user_id = ${userId} and provider = ${platform} and lower(trim(leading '@' from handle)) = ${socialHandleKey(handle)}`;
    }
  }
  const links = await readSocialBlockLinks(userId);
  const verified = links.some(l => l.platform === platform && socialHandleKey(l.username) === socialHandleKey(handle));
  const rows = await sql`select show_followers from public.social_block_settings where profile_id = ${userId} and platform = ${platform} and handle = ${socialHandleKey(handle)}`;
  return { verified, showFollowers: rows[0]?.["show_followers"] === true };
}
