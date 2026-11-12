import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

export const listMyAssets = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listAssets } = await import("./assets.server");
    return listAssets(context.userId);
  });

export const uploadMyAsset = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({
      fileName: z.string().min(1).max(200),
      base64: z.string().min(1).max(8_000_000),
      days: z.number().int().min(1).max(90).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { uploadAsset } = await import("./assets.server");
    const { base64ToBytes } = await import("./storage/s3.server");
    return uploadAsset({ userId: context.userId, bytes: base64ToBytes(data.base64), fileName: data.fileName, days: data.days });
  });

export const getMyAssetUrl = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assetDownloadUrl } = await import("./assets.server");
    return { url: await assetDownloadUrl(context.userId, data.id) };
  });

export const deleteMyAsset = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteAsset } = await import("./assets.server");
    return deleteAsset(context.userId, data.id);
  });

/** Storage used/limit for the active scope (personal or workspace). */
export const getActiveScopeStorage = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { activeScopeStorage } = await import("./entitlement-engine.server");
    return activeScopeStorage(context.userId);
  });
