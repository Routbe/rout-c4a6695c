import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Current forwarding address + double opt-in state for the signed-in member. */
export const getForwardingState = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readForwardingState } = await import("./forwarding.server");
    return readForwardingState(context.userId);
  });

/**
 * Stores a new forwarding address as unconfirmed and mails a confirmation link.
 * Forwarding stays paused until that link is opened.
 */
export const requestForwardingChange = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().min(3).max(254),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit, RateLimitError } = await import("./rate-limit.server");
    try {
      enforceRateLimit(`forwarding:${context.userId}`, 3, 10 * 60 * 1000);
      // Max. 5 bevestigingsmails per dag per lid en max. 2 per ontvanger.
      enforceRateLimit(`forwarding-day:${context.userId}`, 5, 24 * 60 * 60 * 1000);
      const { hitRateLimit } = await import("./rate-limit-db.server");
      const toLimit = await hitRateLimit("forwarding-to", data.email.trim().toLowerCase(), { limit: 3, windowSec: 86_400 });
      if (!toLimit.ok) return { ok: false as const, reason: "rate_limited" as const };
    } catch (error) {
      if (error instanceof RateLimitError) {
        return { ok: false as const, reason: "rate_limited" as const };
      }
      throw error;
    }

    const { requestForwardingConfirmation } = await import("./forwarding.server");
    const { NotEntitledError } = await import("./entitlement.server");
    try {
      const result = await requestForwardingConfirmation(context.userId, data.email);
      return result.ok
        ? {
            ok: true as const,
            sent: result.sent,
            confirmUrl: result.confirmUrl ?? null,
            deliveryError: result.deliveryError ?? null,
          }
        : { ok: false as const, reason: (result.reason ?? "failed") as string };
    } catch (error) {
      if (error instanceof NotEntitledError) {
        return { ok: false as const, reason: "not_entitled" as const };
      }
      throw error;
    }
  });
