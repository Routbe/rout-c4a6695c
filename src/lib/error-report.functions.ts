import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

const schema = z.strictObject({
  code: z.string().max(40),
  status: z.number().int().min(0).max(599),
  detail: z.string().max(300),
  at: z.string().max(40),
  endpoint: z.string().max(120),
});

/** "Foutrapport sturen": one click mails the technical report to support. */
export const sendSaveErrorReport = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
    const gate = await hitRateLimit("error-report-user", context.userId, { limit: 5, windowSec: 3600 });
    if (!gate.ok) return { sent: false, reason: "rate_limited" as const };
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { reportError } = await import("@/lib/email/error-reporter.server");
    const workspaceId = (context as { activeWorkspaceId?: string | null }).activeWorkspaceId ?? null;
    const res = await reportError({
      errorName: data.detail || data.code,
      code: data.code,
      status: data.status,
      stack: null,
      userId: context.userId,
      workspaceId,
      endpoint: data.endpoint,
      method: "POST",
      userAgent: getRequestHeader("user-agent") ?? null,
      at: data.at,
      trigger: "user",
    });
    return { sent: res.sent, reason: res.reason ?? null };
  });
