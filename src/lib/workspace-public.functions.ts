import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readHub, type WorkspaceHub } from "./workspace-hub";
import { readPublishedStudio, workspaceStudioIsPublic, type WorkspaceStudioPayload } from "./workspace-studio";

export type PublicWorkspace = {
  relMe: string[];
  name: string;
  slug: string;
  avatarUrl: string | null;
  description: string | null;
  domain: string | null;
  domainVerified: boolean;
  profileHandle: string | null;
  /** Published hub content, or null when the workspace has not published its Profile Hub. */
  hub: WorkspaceHub | null;
  /** Published Studio page (same engine as personal profiles); wins over the legacy hub. */
  studio: WorkspaceStudioPayload | null;
};

/** Public card for rout.be/w/<slug>. A definer helper returns only non-private fields (never billing data). */
export const getPublicWorkspace = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().trim().toLowerCase().max(40) }).parse(d))
  .handler(async ({ data }): Promise<PublicWorkspace | null> => {
    const { isValidWorkspaceSlug } = await import("./workspace-rules");
    if (!isValidWorkspaceSlug(data.slug)) return null;
    const { hasDatabase, sql } = await import("@/lib/neon");
    if (!hasDatabase()) return null;
    const rows = (await sql`select * from public.rout_public_workspace(${data.slug})`) as {
      name: string; slug: string; avatar_url: string | null; description: string | null; domain: string | null; domain_verified_at: string | null; profile_handle: string | null; public_profile: unknown;
    }[];
    const r = rows[0];
    if (!r) return null;
    const hub = readHub(r.public_profile);
    const studioRaw = readPublishedStudio(r.public_profile);
    // De publiek/privé-schakelaar van de Studio geldt ook voor de openbare route.
    const studio = studioRaw && workspaceStudioIsPublic(studioRaw) ? studioRaw : null;
    const { relMeHrefs } = await import("./relme-links");
    const relRows = (await sql`select * from public.rout_public_workspace_relme(${data.slug})`.catch(() => [])) as { platform: string; username: string }[];
    return {
      relMe: relMeHrefs(relRows),
      name: r.name, slug: r.slug, avatarUrl: r.avatar_url, description: r.description, domain: r.domain,
      domainVerified: Boolean(r.domain_verified_at),
      profileHandle: r.profile_handle, hub: hub.published ? hub : null, studio,
    };
  });

/** rout.be/<handle> → workspace slug when the handle is a workspace root alias; null otherwise. */
export const resolveWorkspaceRootAlias = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ handle: z.string().trim().toLowerCase().max(40) }).parse(d))
  .handler(async ({ data }): Promise<string | null> => {
    if (!/^[a-z0-9-]{3,40}$/.test(data.handle)) return null;
    const { hasDatabase, sql } = await import("@/lib/neon");
    if (!hasDatabase()) return null;
    const rows = (await sql`select public.workspace_slug_for_root_alias(${data.handle}) as slug`.catch(() => [])) as { slug: string | null }[];
    return rows[0]?.slug ?? null;
  });

/** Old personal address of a converted account → its new workspace slug during the 30-day sunset; null otherwise. */
export const resolveMigratedHandle = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ handle: z.string().trim().toLowerCase().max(40), space: z.enum(["root", "alias"]) }).parse(d))
  .handler(async ({ data }): Promise<string | null> => {
    if (!/^[a-z0-9._-]{2,40}$/.test(data.handle)) return null;
    const { hasDatabase, sql } = await import("@/lib/neon");
    if (!hasDatabase()) return null;
    const rows = (await sql`select public.rout_migrated_workspace_for_handle(${data.handle}, ${data.space}) as slug`.catch(() => [])) as { slug: string | null }[];
    return rows[0]?.slug ?? null;
  });
