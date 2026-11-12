import { z } from "zod";
import { draftJsonRecordSchema, toDraftJson } from "./draft-json-schema";
import { optionalProfileImageUrlSchema } from "./profile-image-url";

/**
 * Atomic Studio mutations. The Studio never sends its whole profile again:
 * each save carries only the sections that changed, and the server merges
 * them into the draft of one explicit canvas (`space`). A bio edit therefore
 * cannot fail on an unrelated nested setting such as `displayPrefs.qrSettings`.
 *
 *   meta  → handle, name, bio, avatar, favicon       (updateProfileMeta)
 *   theme → theme, card style, changed display prefs  (updateProfileTheme)
 *   links → the ordered block list                    (updateProfileLinks)
 *
 * Browser-safe: shared by the editor (diffing) and the server (validation).
 */

export const PROFILE_SPACES = ["verified", "alias"] as const;
export type ProfileSpaceId = (typeof PROFILE_SPACES)[number];
/** Canvases the Studio engine can write: the two personal ones, or a workspace (by `workspaceId`). */
export const STUDIO_CANVASES = [...PROFILE_SPACES, "workspace"] as const;
export type StudioCanvas = (typeof STUDIO_CANVASES)[number];

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

const spaceSchema = z.enum(STUDIO_CANVASES);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const workspaceIdSchema = z.string().uuid().optional();

/** A workspace canvas always names its workspace; a personal canvas never does. */
function canvasTarget(value: { space: StudioCanvas; workspaceId?: string }, ctx: z.RefinementCtx) {
  if (value.space === "workspace" && !value.workspaceId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["workspaceId"], message: "required for the workspace canvas" });
  }
  if (value.space !== "workspace" && value.workspaceId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["workspaceId"], message: "only allowed for the workspace canvas" });
  }
}

export const profileMetaPatchSchema = z.strictObject({
  space: spaceSchema,
  workspaceId: workspaceIdSchema,
  username: z.string().trim().min(1).max(60).optional(),
  displayName: nullableText(120),
  tagline: nullableText(240),
  avatarUrl: optionalProfileImageUrlSchema,
  faviconUrl: optionalProfileImageUrlSchema,
}).superRefine(canvasTarget);

export const profileThemePatchSchema = z.strictObject({
  space: spaceSchema,
  workspaceId: workspaceIdSchema,
  theme: z.string().trim().min(1).max(40).optional(),
  cardStyle: z.string().trim().min(1).max(40).optional(),
  /** Only the display-pref keys that changed; merged key by key on the server. */
  prefs: draftJsonRecordSchema.optional().default({}),
  /** Display-pref keys the member removed. */
  dropPrefs: z.array(z.string().min(1).max(200)).max(200).optional().default([]),
}).superRefine(canvasTarget);

export const profileLinksPatchSchema = z.strictObject({
  space: spaceSchema,
  workspaceId: workspaceIdSchema,
  blocks: z.preprocess(toDraftJson, z.array(draftJsonRecordSchema).max(100)),
}).superRefine(canvasTarget);

export type ProfileMetaPatch = z.input<typeof profileMetaPatchSchema>;
export type ProfileThemePatch = z.input<typeof profileThemePatchSchema>;
export type ProfileLinksPatch = z.input<typeof profileLinksPatchSchema>;

/** Parsed result or a short `validation: …` reason the save-error UI understands. */
export function parsePatch<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> | { __invalid: string } {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  return { __invalid: `validation: ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}`.trim().slice(0, 300) };
}

/** Everything the Studio edits, in JSON-canonical form. */
export type StudioSnapshot = {
  username: string;
  displayName: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  faviconUrl: string | null;
  theme: string;
  cardStyle: string;
  prefs: Record<string, unknown>;
  blocks: unknown[];
};

export type StudioPatches = {
  meta: Omit<ProfileMetaPatch, "space"> | null;
  theme: Omit<ProfileThemePatch, "space"> | null;
  links: Omit<ProfileLinksPatch, "space"> | null;
};

const same = (a: unknown, b: unknown) => JSON.stringify(toDraftJson(a)) === JSON.stringify(toDraftJson(b));
const META_KEYS = ["username", "displayName", "tagline", "avatarUrl", "faviconUrl"] as const;

/**
 * Smallest set of patches that turns `saved` into `next`. With no `saved`
 * baseline every section is sent once (still each validated on its own).
 */
export function diffStudioSnapshot(saved: StudioSnapshot | null, next: StudioSnapshot): StudioPatches {
  const meta: Record<string, unknown> = {};
  for (const key of META_KEYS) {
    if (!saved || !same(saved[key], next[key])) meta[key] = next[key];
  }

  const theme: Record<string, unknown> = {};
  if (!saved || saved.theme !== next.theme) theme["theme"] = next.theme;
  if (!saved || saved.cardStyle !== next.cardStyle) theme["cardStyle"] = next.cardStyle;
  const nextPrefs = (toDraftJson(next.prefs) ?? {}) as Record<string, Json>;
  const savedPrefs = (saved ? toDraftJson(saved.prefs) ?? {} : {}) as Record<string, Json>;
  const prefs: Record<string, Json> = {};
  for (const [key, value] of Object.entries(nextPrefs)) {
    if (!saved || !same(savedPrefs[key], value)) prefs[key] = value;
  }
  const dropPrefs = saved ? Object.keys(savedPrefs).filter((key) => !(key in nextPrefs)) : [];
  if (Object.keys(prefs).length) theme["prefs"] = prefs;
  if (dropPrefs.length) theme["dropPrefs"] = dropPrefs;

  const links = !saved || !same(saved.blocks, next.blocks) ? { blocks: toDraftJson(next.blocks) as Json[] } : null;

  return {
    meta: Object.keys(meta).length ? (meta as StudioPatches["meta"]) : null,
    theme: Object.keys(theme).length ? (theme as StudioPatches["theme"]) : null,
    links: links as StudioPatches["links"],
  };
}

export function hasPatches(p: StudioPatches): boolean {
  return Boolean(p.meta || p.theme || p.links);
}
