import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

export const getMySnapchat = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await import("./snapchat.server");
    return { ready: s.snapchatConfigured(), snap: await s.mySnapchat(context.userId) };
  });

export const updateMySnapchat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        moodEmoji: z.string().trim().max(16).nullable().optional().transform((v) => (v === undefined ? undefined : v || null)),
        moodText: z.string().trim().max(60).nullable().optional().transform((v) => (v === undefined ? undefined : v || null)),
        showCard: z.boolean().optional(),
        showMood: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./snapchat.server");
    await s.updateSnapchat(context.userId, data);
    return { ok: true };
  });

export const setBitmojiAvatar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await import("./snapchat.server");
    return { ok: await s.useBitmojiAsAvatar(context.userId) };
  });

export const disconnectMySnapchat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await import("./snapchat.server");
    await s.disconnectSnapchat(context.userId);
    return { ok: true };
  });

export const getPublicSnapchat = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ handle: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./snapchat.server");
    return s.publicSnapchat(data.handle);
  });
