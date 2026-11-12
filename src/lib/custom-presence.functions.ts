import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import type { PresenceRules } from "./custom-presence";

export const getCustomPresence = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => (await import("./custom-presence.server")).myCustomPresence(context.userId));

/** Returns the new key once; it is never shown again. */
export const rotatePresenceApiKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => ({ key: await (await import("./custom-presence.server")).rotatePresenceKey(context.userId) }));

export const revokePresenceApiKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => { await (await import("./custom-presence.server")).revokePresenceKey(context.userId); return { ok: true }; });

export const setMyCustomStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const { presencePayloadSchema } = await import("./custom-presence");
    const s = await import("./custom-presence.server");
    if (data === null) { await s.clearCustomStatus(context.userId); return { ok: true }; }
    await s.setCustomStatus(context.userId, presencePayloadSchema.parse(data));
    return { ok: true };
  });

export const savePresenceRules = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: PresenceRules) => input)
  .handler(async ({ data, context }) => { await (await import("./custom-presence.server")).saveRules(context.userId, data); return { ok: true }; });
