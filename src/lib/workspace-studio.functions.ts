import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * Load / publish / discard for the workspace canvas of the shared Studio
 * engine (ProfileEditor variant "workspace"). Section saves go through the
 * same updateProfileMeta/Theme/Links mutations with `space: "workspace"`.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type WorkspaceStudioDTO = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: string;
  canEdit: boolean;
  /** Plus/Pro/Business: unlocks the same Pro design options as a verified member. */
  proPlan: boolean;
  /** Claimed business domain; when DNS-verified the hub lives at rout.be/<domain>. */
  domain: string | null;
  domainVerified: boolean;
  username: string;
  displayName: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  faviconUrl: string | null;
  theme: string;
  cardStyle: string;
  blocks: Json[];
  displayPrefs: Record<string, Json>;
  /** The workspace equivalent of identity verification: a DNS-verified business domain or the Business plan. */
  verified: boolean;
  status: "active";
  verifiedLegalName: null;
  draftRevision: number;
  publishedRevision: number;
  hasUnpublishedChanges: boolean;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
};

const slugInput = z.object({ workspaceSlug: z.string().trim().toLowerCase().min(1).max(40) });
const revisionInput = z.object({ workspaceId: z.string().uuid(), expectedRevision: z.number().int().min(1) });

export const getWorkspaceStudioProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => slugInput.parse(d))
  .handler(async ({ data, context }): Promise<WorkspaceStudioDTO> => {
    const { readWorkspaceForStudio, readOrCreateWorkspaceDraft } = await import("./workspace-studio.server");
    const { canEditWorkspaceHub } = await import("./workspace-rules");
    const ws = await readWorkspaceForStudio(context.userId, data.workspaceSlug);
    if (!ws) throw new Error("Forbidden");
    const canEdit = canEditWorkspaceHub(ws.role);
    const { workspaceEffectivePlan } = await import("./entitlement-engine.server");
    const plan = await workspaceEffectivePlan(ws.workspaceId).catch(() => ws.plan);
    const draft = await readOrCreateWorkspaceDraft(ws, canEdit);
    return {
      workspaceId: ws.workspaceId,
      workspaceName: ws.name,
      workspaceSlug: ws.slug,
      role: ws.role,
      canEdit,
      proPlan: plan !== "free",
      domain: ws.domain,
      domainVerified: ws.domainVerified,
      ...draft.payload,
      verified: ws.domainVerified || plan === "business",
      status: "active",
      verifiedLegalName: null,
      ...draft.meta,
    };
  });

async function editableWorkspace(userId: string, workspaceId: string) {
  const { getWorkspaceRole } = await import("./workspaces.server");
  const { canEditWorkspaceHub } = await import("./workspace-rules");
  if (!canEditWorkspaceHub(await getWorkspaceRole(userId, workspaceId))) throw new Error("forbidden");
}

export const publishWorkspaceProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => revisionInput.parse(d))
  .handler(async ({ data, context }) => {
    try {
      await editableWorkspace(context.userId, data.workspaceId);
      const { publishWorkspaceDraft } = await import("./workspace-studio.server");
      const meta = await publishWorkspaceDraft(data.workspaceId, data.expectedRevision);
      return { ok: true as const, meta, reason: null };
    } catch (error) {
      return { ok: false as const, meta: null, reason: error instanceof Error ? error.message : "publish_failed" };
    }
  });

export const discardWorkspaceStudioDraft = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => revisionInput.parse(d))
  .handler(async ({ data, context }) => {
    try {
      await editableWorkspace(context.userId, data.workspaceId);
      const { sql } = await import("@/lib/neon");
      const slugRow = ((await sql`select slug from public.workspaces where id = ${data.workspaceId} limit 1`) as { slug: string }[])[0];
      if (!slugRow) throw new Error("workspace_not_found");
      const { readWorkspaceForStudio, discardWorkspaceDraft } = await import("./workspace-studio.server");
      const ws = await readWorkspaceForStudio(context.userId, slugRow.slug);
      if (!ws) throw new Error("forbidden");
      const { readPublishedStudio, seedWorkspaceStudio } = await import("./workspace-studio");
      const { readHub } = await import("./workspace-hub");
      const live =
        readPublishedStudio(ws.publicProfile) ??
        seedWorkspaceStudio({ slug: ws.slug, name: ws.name, avatarUrl: ws.avatarUrl }, readHub(ws.publicProfile));
      const result = await discardWorkspaceDraft(ws, live, data.expectedRevision);
      return { ok: true as const, ...result, reason: null };
    } catch (error) {
      return { ok: false as const, payload: null, meta: null, reason: error instanceof Error ? error.message : "discard_failed" };
    }
  });
