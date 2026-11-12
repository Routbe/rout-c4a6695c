import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireDeveloperAccess } from "./auth/developer-access";
import { feedbackFormSchema, feedbackResponseSchema } from "./feedback";

export const getMyFeedback = createServerFn({ method: "GET" }).middleware([requireDeveloperAccess]).handler(async ({ context }) => {
  const { listFeedback } = await import("./feedback.server");
  return listFeedback(context.userId, context.activeWorkspaceId);
});
export const createFeedbackForm = createServerFn({ method: "POST" }).middleware([requireDeveloperAccess])
  .inputValidator((d: unknown) => feedbackFormSchema.parse(d)).handler(async ({ data, context }) => {
    const { createFeedback } = await import("./feedback.server");
    return createFeedback(context.userId, context.activeWorkspaceId, data);
  });
export const changeFeedback = createServerFn({ method: "POST" }).middleware([requireDeveloperAccess])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["feature", "delete_response", "delete_form", "visibility"]), enabled: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { updateFeedback } = await import("./feedback.server");
    return updateFeedback(context.userId, context.activeWorkspaceId, data.id, data.action, data.enabled);
  });
export const getPublicFeedback = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().max(100).optional(), space: z.enum(["root", "alias", "workspace"]).optional(), handle: z.string().max(64).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { readPublicFeedback } = await import("./feedback.server");
    return readPublicFeedback(data.slug ?? null, data.space ?? null, data.handle ?? null);
  });
export const sendFeedbackResponse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => feedbackResponseSchema.parse(d))
  .handler(async ({ data }) => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("feedback");
    const { hitRateLimit, clientIp } = await import("./rate-limit-db.server");
    const limit = await hitRateLimit("feedback-submit", clientIp(getRequest()), { limit: 5, windowSec: 600 });
    if (!limit.ok) return { ok: false, error: "rate_limited" };
    const { submitFeedback } = await import("./feedback.server");
    try { return await submitFeedback(data); }
    catch { return { ok: false, error: "feedback_unavailable" }; }
  });