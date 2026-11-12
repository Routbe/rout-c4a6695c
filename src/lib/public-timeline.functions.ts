import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalAuth } from "@/lib/auth/middleware";

export const getPublicTimeline = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    // `userId` is a sealed public reference (or the member's own id in Studio); raw ids of others are refused.
    const { resolveOwnerRef } = await import("@/lib/auth/public-ref.server");
    const owner = await resolveOwnerRef(data.userId, context.userId);
    if (!owner) return [];
    const { readPublicTimeline } = await import("./public-timeline.server");
    try {
      return await readPublicTimeline(owner);
    } catch (error) {
      console.error("[public-timeline]", error);
      return [];
    }
  });
