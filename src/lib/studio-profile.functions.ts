import { normalizeLayersPref } from "./profile-display";
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import { z } from "zod";
import { draftJsonRecordSchema } from "./draft-json-schema";
import { optionalProfileImageUrlSchema } from "./profile-image-url";
import { normalizeSocialGridBlocks } from "./social-grid";

/**
 * Profile Hub Studio RPC layer.
 *
 * Authentication still comes from the managed auth provider (we only need the
 * user id), while every byte of profile content lives in our Neon Postgres
 * database in Frankfurt (see `src/lib/studio-profile.server.ts`).
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type StudioProfileDTO = {
  username: string | null;
  displayName: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  faviconUrl: string | null;
  theme: string;
  cardStyle: string;
  blocks: Json[];
  verified: boolean;
  status: string;
  verifiedLegalName: string | null;
  displayPrefs: Record<string, Json>;
  subdomainAlias: string | null;
  rootStatus: string | null;
  aliasHandle: string | null;
  isBusiness?: boolean;
  isInfluencer?: boolean;
  draftRevision: number;
  publishedRevision: number;
  hasUnpublishedChanges: boolean;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
};

export const getStudioProfile = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readStudioProfile } = await import("./studio-profile.server");
    const live = await readStudioProfile(context.userId);
    if (!live) return null;
    const { readOrCreateProfileDraft } = await import("./profile-drafts.server");
    const livePayload: SaveStudioProfileInput = {
      username: live.username ?? "",
      displayName: live.displayName,
      tagline: live.tagline,
      avatarUrl: live.avatarUrl,
      faviconUrl: live.faviconUrl,
      theme: live.theme,
      cardStyle: live.cardStyle,
      blocks: live.blocks as Json[],
      displayPrefs: live.displayPrefs as Record<string, Json>,
    };
    const draft = await readOrCreateProfileDraft(context.userId, "verified", livePayload);
    return { ...live, ...draft.payload, ...draft.meta } as StudioProfileDTO;
  });

export type SaveStudioProfileInput = {
  username: string;
  displayName?: string | null;
  tagline?: string | null;
  avatarUrl?: string | null;
  faviconUrl?: string | null;
  theme?: string | null;
  cardStyle?: string | null;
  blocks?: Json[];
  displayPrefs?: Record<string, Json> | null;
  expectedRevision?: number;
};

const jsonRecordSchema = draftJsonRecordSchema;
const optionalUrlSchema = optionalProfileImageUrlSchema;
const saveStudioProfileSchema = z.strictObject({
  username: z.string().trim().min(1).max(60),
  displayName: z.string().trim().max(120).nullable().optional(),
  tagline: z.string().trim().max(240).nullable().optional(),
  avatarUrl: optionalUrlSchema,
  faviconUrl: optionalUrlSchema,
  theme: z.string().trim().min(1).max(40).nullable().optional(),
  cardStyle: z.string().trim().min(1).max(40).nullable().optional(),
  blocks: z.array(jsonRecordSchema).max(100).optional(),
  displayPrefs: jsonRecordSchema.nullable().optional(),
  expectedRevision: z.number().int().min(0).optional(),
});
const revisionSchema = z.strictObject({ expectedRevision: z.number().int().min(1) });
const handleSchema = z.strictObject({ handle: z.string().trim().min(1).max(60) });

function validateStudioProfile(input: unknown): SaveStudioProfileInput | { __invalid: string } {
  const safe = (schema: typeof saveStudioProfileSchema) => schema.safeParse(input);
  const result = safe(saveStudioProfileSchema);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { __invalid: `validation: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.slice(0, 300) };
  }
  const parsed = result.data as unknown as SaveStudioProfileInput;
  // Server-side normalization of the layered design (never trust the client).
  if (parsed.displayPrefs && "designLayers" in parsed.displayPrefs) {
    parsed.displayPrefs = {
      ...parsed.displayPrefs,
      designLayers: normalizeLayersPref(parsed.displayPrefs["designLayers"]),
    };
  }
  // Social Grid cards: unsafe images and links never reach a draft.
  if (parsed.blocks) parsed.blocks = normalizeSocialGridBlocks(parsed.blocks);
  return parsed;
}

function validateHandle(input: unknown): { handle: string } {
  return handleSchema.parse(input);
}

function validateAnalyticsRange(input: unknown): { days?: number | null } {
  return z
    .strictObject({ days: z.number().int().min(1).max(3650).nullable().optional() })
    .parse(input);
}

export const saveStudioProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(validateStudioProfile)
  .handler(async ({ data, context }) => {
    const { runDraftSave } = await import("./draft-save.server");
    const { classifySaveError } = await import("./save-errors");
    if ("__invalid" in data) {
      const error = classifySaveError(data.__invalid);
      return { ok: false as const, profile: null, reason: error.detail, error, conflict: null };
    }
    const workspaceId = (context as { activeWorkspaceId?: string | null }).activeWorkspaceId ?? null;
    return runDraftSave(context.userId, workspaceId, "verified", data as never, "saveStudioProfile");
  });

export const publishStudioProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input) => revisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { readOrCreateProfileDraft, publishProfileDraft } = await import("./profile-drafts.server");
      const { readStudioProfile, isHandleFree } = await import("./studio-profile.server");
      const live = await readStudioProfile(context.userId);
      if (!live) throw new Error("profile_not_found");
      const current = await readOrCreateProfileDraft(context.userId, "verified", {
        username: live.username ?? "",
        displayName: live.displayName,
        tagline: live.tagline,
        avatarUrl: live.avatarUrl,
        faviconUrl: live.faviconUrl,
        theme: live.theme,
        cardStyle: live.cardStyle,
        blocks: live.blocks,
        displayPrefs: live.displayPrefs,
      });
      const username = String(current.payload.username ?? "");
      const available = await isHandleFree(username, context.userId);
      if (!available.ok) throw new Error(`handle_${available.reason}`);
      const meta = await publishProfileDraft(context.userId, "verified", data.expectedRevision);
      return { ok: true as const, meta, reason: null };
    } catch (error) {
      return { ok: false as const, meta: null, reason: error instanceof Error ? error.message : "publish_failed" };
    }
  });

export const discardStudioDraft = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input) => revisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { readStudioProfile } = await import("./studio-profile.server");
      const { discardProfileDraft } = await import("./profile-drafts.server");
      const live = await readStudioProfile(context.userId);
      if (!live) throw new Error("profile_not_found");
      const result = await discardProfileDraft(context.userId, "verified", {
        username: live.username ?? "",
        displayName: live.displayName,
        tagline: live.tagline,
        avatarUrl: live.avatarUrl,
        faviconUrl: live.faviconUrl,
        theme: live.theme,
        cardStyle: live.cardStyle,
        blocks: live.blocks,
        displayPrefs: live.displayPrefs,
      }, data.expectedRevision);
      return { ok: true as const, ...result, reason: null };
    } catch (error) {
      return { ok: false as const, payload: null, meta: null, reason: error instanceof Error ? error.message : "discard_failed" };
    }
  });

export const checkStudioHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(validateHandle)
  .handler(async ({ data, context }) => {
    const { isHandleFree } = await import("./studio-profile.server");
    return isHandleFree(data.handle, context.userId);
  });

export const getStudioAnalytics = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(validateAnalyticsRange)
  .handler(async ({ data, context }) => {
    const { readStudioAnalytics } = await import("./studio-profile.server");
    return readStudioAnalytics(context.userId, data.days ?? null);
  });

/** Public read used by the /@handle profile pages — no auth required. */
export const getPublicProfileByHandle = createServerFn({ method: "GET" })
  .inputValidator(validateHandle)
  .handler(async ({ data }) => {
    const { readPublicProfile } = await import("./studio-profile.server");
    const row = await readPublicProfile(data.handle);
    if (!row) return null;
    const { parseDisplayPrefs } = await import("./profile-display");
    const { redactPrivateProfile } = await import("./public-timeline");
    const prefs = parseDisplayPrefs((row as Record<string, unknown>)["display_prefs"]);
    const { withPublicRef } = await import("@/lib/auth/public-ref.server");
    // Visitors get a sealed reference, never the owner's internal account id.
    return (await withPublicRef(redactPrivateProfile(row as Record<string, unknown>, prefs))) as Record<string, Json>;
  });
