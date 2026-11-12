import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import {
  parsePatch,
  profileLinksPatchSchema,
  profileMetaPatchSchema,
  profileThemePatchSchema,
  type StudioCanvas,
} from "./profile-draft-patch";
import { normalizeLayersPref } from "./profile-display";
import { normalizeQrSettings } from "./qr-settings";
import { normalizeSocialGridBlocks } from "./social-grid";
import { normalizeOmniBlocks } from "./omni-blocks";

/**
 * Atomic Studio mutations, one per section. Each validates only its own
 * fields and writes to the canvas named by `space`, so the verified profile,
 * the private alias and every workspace can never overwrite each other.
 */

type Patch = { fields?: Record<string, unknown>; prefs?: Record<string, unknown>; dropPrefs?: string[] };

async function invalid(reason: string) {
  const { classifySaveError } = await import("./save-errors");
  return { ok: false as const, meta: null, error: classifySaveError(reason) };
}

function workspaceOf(context: unknown): string | null {
  return (context as { activeWorkspaceId?: string | null }).activeWorkspaceId ?? null;
}

/** One dispatcher: personal canvases by user, the workspace canvas by workspace id (editors only). */
async function runCanvasPatch(
  userId: string,
  context: unknown,
  space: StudioCanvas,
  workspaceId: string | undefined,
  patch: Patch,
  endpoint: string,
) {
  const { runDraftPatch, runWorkspaceDraftPatch } = await import("./draft-save.server");
  if (space === "workspace" && workspaceId) return runWorkspaceDraftPatch(userId, workspaceId, patch, endpoint);
  if (space === "workspace") return invalid("validation: workspaceId required");
  return runDraftPatch(userId, workspaceOf(context), space, patch, endpoint);
}

export const updateProfileMeta = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => parsePatch(profileMetaPatchSchema, input))
  .handler(async ({ data, context }) => {
    if ("__invalid" in data) return invalid(data.__invalid);
    const { space, workspaceId, ...fields } = data;
    return runCanvasPatch(context.userId, context, space, workspaceId, { fields }, "updateProfileMeta");
  });

export const updateProfileTheme = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => parsePatch(profileThemePatchSchema, input))
  .handler(async ({ data, context }) => {
    if ("__invalid" in data) return invalid(data.__invalid);
    const { space, workspaceId, prefs, dropPrefs, ...fields } = data;
    // Strict server-side defaults for structured prefs (never trust the client):
    // an empty or invalid QR style is removed so the renderer uses the ROUT default.
    const safePrefs: Record<string, unknown> = { ...prefs };
    const drops = [...dropPrefs];
    if ("qrSettings" in safePrefs) {
      const qr = normalizeQrSettings(safePrefs["qrSettings"]);
      if (qr) safePrefs["qrSettings"] = JSON.parse(JSON.stringify(qr));
      else {
        delete safePrefs["qrSettings"];
        drops.push("qrSettings");
      }
    }
    if ("designLayers" in safePrefs) safePrefs["designLayers"] = normalizeLayersPref(safePrefs["designLayers"]);
    return runCanvasPatch(
      context.userId,
      context,
      space,
      workspaceId,
      { fields, prefs: safePrefs, dropPrefs: drops },
      "updateProfileTheme",
    );
  });

export const updateProfileLinks = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => parsePatch(profileLinksPatchSchema, input))
  .handler(async ({ data, context }) => {
    if ("__invalid" in data) return invalid(data.__invalid);
    return runCanvasPatch(context.userId, context, data.space, data.workspaceId, { fields: { blocks: normalizeOmniBlocks(normalizeSocialGridBlocks(data.blocks)) } }, "updateProfileLinks");
  });
