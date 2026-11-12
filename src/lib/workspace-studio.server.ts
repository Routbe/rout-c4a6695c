import { sql } from "@/lib/neon";
import type { DraftMeta } from "./profile-drafts.server";
import { readHub } from "./workspace-hub";
import { seedWorkspaceStudio, type WorkspaceStudioPayload } from "./workspace-studio";
import type { WorkspaceRole } from "./workspace-rules";

/**
 * Draft store of the Workspace Studio (0163). Same revision model as the
 * personal drafts: section patches bump `revision`, publishing sets
 * `published_revision = revision` and copies the payload to
 * `workspaces.public_profile.studio` in one statement.
 * Every function runs under the caller's RLS; callers check the role first.
 */

type Row = Record<string, unknown>;

export type WorkspaceStudioRow = {
  workspaceId: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  plan: string;
  role: WorkspaceRole;
  publicProfile: unknown;
  /** Claimed business domain (rout.be/<domain>) and its DNS verification. */
  domain: string | null;
  domainVerified: boolean;
};

function meta(row: Row): DraftMeta {
  const draftRevision = Number(row["revision"] ?? 0);
  const publishedRevision = Number(row["published_revision"] ?? 0);
  return {
    draftRevision,
    publishedRevision,
    hasUnpublishedChanges: draftRevision !== publishedRevision,
    draftUpdatedAt: (row["updated_at"] as string | null) ?? null,
    publishedAt: (row["published_at"] as string | null) ?? null,
  };
}

/** Missing table = 0163 not applied yet; surfaced as one clear reason. */
function pendingMigration(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/workspace_profile_drafts|patch_workspace_profile_draft/.test(message) && /does not exist/.test(message)) {
    throw new Error("workspace_studio_migration_pending");
  }
  throw error;
}

/** Workspace by slug plus the caller's role; null when not a member. */
export async function readWorkspaceForStudio(userId: string, slug: string): Promise<WorkspaceStudioRow | null> {
  const rows = (await sql`
    select w.id, w.name, w.slug, w.avatar_url, w.plan, w.public_profile, w.domain, w.domain_verified_at, m.role::text as role
      from public.workspaces w
      join public.workspace_members m on m.workspace_id = w.id and m.user_id = ${userId}
     where w.slug = ${slug.toLowerCase()}
     limit 1
  `) as Row[];
  const r = rows[0];
  if (!r) return null;
  return {
    workspaceId: String(r["id"]),
    name: String(r["name"]),
    slug: String(r["slug"]),
    avatarUrl: (r["avatar_url"] as string | null) ?? null,
    plan: String(r["plan"] ?? "free"),
    role: r["role"] as WorkspaceRole,
    publicProfile: r["public_profile"],
    domain: (r["domain"] as string | null) ?? null,
    domainVerified: Boolean(r["domain_verified_at"]),
  };
}

export async function readOrCreateWorkspaceDraft(
  ws: WorkspaceStudioRow,
  canEdit: boolean,
): Promise<{ payload: WorkspaceStudioPayload; meta: DraftMeta }> {
  try {
    if (canEdit) {
      const seed = seedWorkspaceStudio(
        { slug: ws.slug, name: ws.name, avatarUrl: ws.avatarUrl },
        readHub(ws.publicProfile),
      );
      // A legacy published hub counts as "published"; a fresh workspace starts unpublished.
      await sql`
        insert into public.workspace_profile_drafts (workspace_id, payload, revision, published_revision)
        values (${ws.workspaceId}, ${JSON.stringify(seed)}::jsonb, 1, 0)
        on conflict (workspace_id) do nothing
      `;
    }
    const rows = (await sql`
      select payload, revision, published_revision, updated_at, published_at
        from public.workspace_profile_drafts where workspace_id = ${ws.workspaceId} limit 1
    `) as Row[];
    const row = rows[0];
    const fallback = seedWorkspaceStudio({ slug: ws.slug, name: ws.name, avatarUrl: ws.avatarUrl }, readHub(ws.publicProfile));
    if (!row) return { payload: fallback, meta: meta({ revision: 0, published_revision: 0 }) };
    const payload = { ...fallback, ...((row["payload"] as Partial<WorkspaceStudioPayload>) ?? {}), username: ws.slug };
    return { payload, meta: meta(row) };
  } catch (error) {
    pendingMigration(error);
  }
}

export async function patchWorkspaceDraft(
  workspaceId: string,
  patch: { fields?: Record<string, unknown>; prefs?: Record<string, unknown>; dropPrefs?: string[] },
): Promise<DraftMeta> {
  try {
    const rows = (await sql.query(
      `select * from public.patch_workspace_profile_draft($1::uuid, $2::jsonb, $3::jsonb, array(select jsonb_array_elements_text($4::jsonb)))`,
      [workspaceId, JSON.stringify(patch.fields ?? {}), JSON.stringify(patch.prefs ?? {}), JSON.stringify(patch.dropPrefs ?? [])],
    )) as Row[];
    const row = rows[0];
    if (!row) throw new Error("draft_save_failed");
    return meta(row);
  } catch (error) {
    pendingMigration(error);
  }
}

/** Publishes exactly `expectedRevision`; a newer draft or a stale editor gets `draft_conflict`. */
export async function publishWorkspaceDraft(workspaceId: string, expectedRevision: number): Promise<DraftMeta> {
  try {
    const rows = (await sql.query(
      `with d as (
         update public.workspace_profile_drafts
            set published_revision = revision, published_at = now()
          where workspace_id = $1::uuid and revision = $2::bigint
          returning payload, revision, published_revision, updated_at, published_at
       ), w as (
         update public.workspaces
            set public_profile = coalesce(public_profile, '{}'::jsonb)
                  || jsonb_build_object('published', true, 'studio', (select payload from d))
          where id = $1::uuid and exists (select 1 from d)
          returning id
       )
       select d.revision, d.published_revision, d.updated_at, d.published_at, (select count(*) from w) as written from d`,
      [workspaceId, expectedRevision],
    )) as Row[];
    const row = rows[0];
    if (!row) throw new Error("draft_conflict");
    if (Number(row["written"]) !== 1) throw new Error("publish_failed");
    return meta(row);
  } catch (error) {
    pendingMigration(error);
  }
}

/** Throws the draft away: back to the last published Studio page (or the seed). */
export async function discardWorkspaceDraft(
  ws: WorkspaceStudioRow,
  live: WorkspaceStudioPayload,
  expectedRevision: number,
): Promise<{ payload: WorkspaceStudioPayload; meta: DraftMeta }> {
  try {
    const rows = (await sql`
      update public.workspace_profile_drafts
         set payload = ${JSON.stringify(live)}::jsonb,
             revision = revision + 1,
             published_revision = revision + 1,
             updated_at = now()
       where workspace_id = ${ws.workspaceId} and revision = ${expectedRevision}
       returning payload, revision, published_revision, updated_at, published_at
    `) as Row[];
    const row = rows[0];
    if (!row) throw new Error("draft_conflict");
    return { payload: { ...live, username: ws.slug }, meta: meta(row) };
  } catch (error) {
    pendingMigration(error);
  }
}

/** Stores the workspace QR style in the draft and, when live, the published studio snapshot. */
export async function saveWorkspaceQr(workspaceId: string, style: unknown): Promise<void> {
  const encoded = JSON.stringify(style);
  try {
    const results = await sql.transaction([
      sql`update public.workspace_profile_drafts
        set payload = jsonb_set(payload, '{displayPrefs}',
              coalesce(payload->'displayPrefs', '{}'::jsonb) || jsonb_build_object('qrSettings', ${encoded}::jsonb), true),
            revision = revision + 1,
            published_revision = case when published_revision = revision then revision + 1 else published_revision end,
            updated_at = now()
        where workspace_id = ${workspaceId} returning workspace_id`,
      sql`update public.workspaces
        set public_profile = jsonb_set(public_profile, '{studio,displayPrefs}',
              coalesce(public_profile->'studio'->'displayPrefs', '{}'::jsonb) || jsonb_build_object('qrSettings', ${encoded}::jsonb), true)
        where id = ${workspaceId} and jsonb_typeof(public_profile->'studio') = 'object'`,
    ]);
    if (!results[0]?.length) throw new Error("workspace_draft_not_found");
  } catch (error) {
    pendingMigration(error);
    throw error;
  }
}
