import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Admin-only: the SEPA name-mismatch review queue (matcher level 2b). */
export const listSepaReviewQueue = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["open", "approved", "rejected", "all"]).optional(),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { listSepaReviews, countSepaReviews } = await import("./sepa-review.server");
    const [rows, counts] = await Promise.all([
      listSepaReviews({
        status: data.status ?? "open",
        search: data.search ?? null,
        limit: data.limit ?? 200,
      }),
      countSepaReviews(),
    ]);
    return { rows, counts };
  });

/** Admin-only: approve (settle + activate) or reject one review row. */
export const decideSepaReviewRow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { decideSepaReview } = await import("./sepa-review.server");
    return decideSepaReview(data.id, data.decision, context.userId, data.notes ?? null);
  });
