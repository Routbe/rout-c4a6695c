import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenInput = z.object({ token: z.string().min(10).max(2000) });

/** Read-only: shows what the link would do. Never changes data. */
export const getReviewPreview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const { previewReview } = await import("./review-decision.server");
    return previewReview(data.token);
  });

/** Applies the decision — only after the admin presses confirm. */
export const confirmReviewDecision = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    tokenInput.extend({ note: z.string().trim().max(400).nullable().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { confirmReview } = await import("./review-decision.server");
    return confirmReview(data.token, data.note ?? null);
  });
