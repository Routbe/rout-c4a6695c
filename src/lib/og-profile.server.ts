import { sql } from "@/lib/neon";
import { parseDisplayPrefs } from "@/lib/profile-display";

/** Public-only data, selected explicitly by namespace (no ambiguous fallback). */
export async function readOgProfile(handle: string, space: "root" | "alias" | "workspace") {
  if (space === "workspace") return readOgWorkspace(handle);
  const rows = space === "alias"
    ? await sql`
      select a.display_name, a.tagline, a.bio, a.avatar_url, a.display_prefs, a.theme,
             false as verified, false as is_business, false as is_influencer
        from public.alias_profiles a join public.profiles p on p.id = a.user_id
       where lower(a.handle) = ${handle} and a.enabled = true
         and coalesce(p.is_banned, false) = false
         and coalesce(p.is_suspended, false) = false
         and coalesce(to_jsonb(p)->>'status', 'active') not in ('frozen', 'banned', 'suspended')
       limit 1`
    : await sql`
      select display_name, tagline, bio, avatar_url, verified,
             to_jsonb(p)->'display_prefs' as display_prefs,
             to_jsonb(p)->>'theme' as theme,
             coalesce((to_jsonb(p)->>'is_business')::boolean, false) as is_business,
             coalesce((to_jsonb(p)->>'is_influencer')::boolean, false) as is_influencer
        from public.profiles p
       where lower(username) = ${handle} and coalesce(is_banned, false) = false
         and coalesce(is_suspended, false) = false
         and coalesce(to_jsonb(p)->>'status', 'active') not in ('frozen', 'banned', 'suspended')
       limit 1`;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row && parseDisplayPrefs(row.display_prefs).publicProfile ? row : null;
}

/** Workspace card: published Studio design when public, else the public name/logo/intro the /w/ page also shows. */
async function readOgWorkspace(slug: string) {
  const { readPublishedStudio, workspaceStudioIsPublic } = await import("@/lib/workspace-studio");
  const rows = (await sql`select * from public.rout_public_workspace(${slug})`) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  const raw = readPublishedStudio(r.public_profile);
  const studio = raw && workspaceStudioIsPublic(raw) ? raw : null;
  return {
    display_name: studio?.displayName || (r.name as string),
    tagline: studio?.tagline ?? null,
    bio: (r.description as string | null) ?? null,
    avatar_url: studio?.avatarUrl || (r.avatar_url as string | null),
    display_prefs: { ...(studio?.displayPrefs ?? {}), publicProfile: true },
    theme: studio?.theme ?? "",
    verified: Boolean(r.domain_verified_at),
    is_business: Boolean(r.domain_verified_at),
    is_influencer: false,
  } as Record<string, unknown>;
}
