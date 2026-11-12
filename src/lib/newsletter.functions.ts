import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Public RPC for the signup block on profile pages. */
const schema = z.object({
  handle: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .transform((v) => v.replace(/^@+/, "").toLowerCase()),
  email: z.string().trim().toLowerCase().email().max(200),
  locale: z.string().max(10).optional().nullable(),
  altcha: z.string().max(4000).optional().nullable(),
});

export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("signup_block");
    const { assertHuman } = await import("./altcha.server");
    await assertHuman(data.altcha ?? null);
    const { subscribeToNewsletter } = await import("./newsletter.server");
    const ip = getRequestHeader("cf-connecting-ip") ?? (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? null;
    return subscribeToNewsletter({ handle: data.handle, email: data.email, locale: data.locale ?? null, ip });
  });

const tokenSchema = z.object({ token: z.string().max(100) });

/** Public: confirm via the one-time mail link (a button click, never on GET). */
export const confirmNewsletterSubscription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { confirmSubscription } = await import("./newsletter.server");
    try {
      return await confirmSubscription(data.token);
    } catch {
      return { ok: false as const };
    }
  });

/** Public: unsubscribe via the mail link. */
export const leaveNewsletter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { unsubscribe } = await import("./newsletter.server");
    try {
      return await unsubscribe(data.token);
    } catch {
      return { ok: false as const };
    }
  });

/** Owner: counts per profile (no addresses). */
export const getMySubscriberSummary = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { mySubscriberSummary } = await import("./newsletter.server");
    return mySubscriberSummary();
  });

/** Owner: the only place addresses are decrypted — the Studio CSV download. */
export const exportMySubscribers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ confirmedOnly: z.boolean().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { hitRateLimit } = await import("./rate-limit-db.server");
    const limit = await hitRateLimit("subscriber-export", context.userId, { limit: 10, windowSec: 3600 }, { failClosed: true });
    if (!limit.ok) return { ok: false as const, error: "rate_limited" as const };
    const { exportMySubscribersCsv } = await import("./newsletter.server");
    try {
      const { csv, count } = await exportMySubscribersCsv(context.userId, { confirmedOnly: data.confirmedOnly === true });
      return { ok: true as const, csv, count };
    } catch {
      return { ok: false as const, error: "unavailable" as const };
    }
  });
