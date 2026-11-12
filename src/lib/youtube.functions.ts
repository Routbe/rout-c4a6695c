import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** The caller's own YouTube vault state and card (never tokens). */
export const getMyYouTube = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const y = await import("./youtube.server");
    return y.myYouTube(context.userId);
  });

export const setYouTubeCardVisible = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { visible: boolean }) => ({ visible: input?.visible === true }))
  .handler(async ({ data, context }) => {
    const y = await import("./youtube.server");
    await y.setYouTubeVisible(context.userId, data.visible);
    return { ok: true };
  });

export const disconnectYouTubeVault = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const y = await import("./youtube.server");
    await y.disconnectYouTube(context.userId);
    return { ok: true };
  });
