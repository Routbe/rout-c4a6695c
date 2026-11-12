import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { PLATFORM_FEATURES } from "./platform-features";

async function admin(userId: string) {
  const { assertAdminRole } = await import("./admin.server");
  await assertAdminRole(userId);
}

const featureIds = PLATFORM_FEATURES.map((f) => f.id) as [string, ...string[]];

/** Admin: every platform switch with its current state and last change. */
export const adminListPlatformFeatures = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await admin(context.userId);
    const { listPlatformFeatureRows } = await import("./platform-features.server");
    return listPlatformFeatureRows();
  });

export const adminSetPlatformFeature = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ feature: z.enum(featureIds), enabled: z.boolean(), note: z.string().trim().max(300).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { setPlatformFeature } = await import("./platform-features.server");
    await setPlatformFeature({
      adminId: context.userId,
      feature: data.feature as (typeof PLATFORM_FEATURES)[number]["id"],
      enabled: data.enabled,
      note: data.note || null,
    });
    return { ok: true as const };
  });

/** Public: which platform features are on (no personal data), for hiding disabled UI. */
export const getPlatformFeatures = createServerFn({ method: "GET" }).handler(async () => {
  const { readPlatformFeatures } = await import("./platform-features.server");
  return readPlatformFeatures();
});

export const adminListWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().max(120).default(""), limit: z.number().int().min(1).max(500).default(100) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { listWorkspacesForAdmin } = await import("./admin-platform.server");
    return listWorkspacesForAdmin(data);
  });

export const adminActOnWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), action: z.enum(["hide", "show", "revoke_domain"]), note: z.string().trim().max(300).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { actOnWorkspace } = await import("./admin-platform.server");
    return actOnWorkspace(context.userId, data.workspaceId, data.action, data.note || null);
  });

export const adminSearchHandles = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string().trim().min(2).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { searchHandleRegistry } = await import("./admin-platform.server");
    return searchHandleRegistry(data.query);
  });
