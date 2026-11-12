import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { contactTriageInput } from "./contact-triage";

const querySchema = z.object({
  status: z.enum(["all", "pending", "sent", "sent_partial", "failed"]).default("all"),
  /** ISO date-time boundaries for the export window. */
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(1000).default(200),
});

/** Admin-only: contact form submissions, filtered by status and period. */
export const listContactSubmissions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => querySchema.parse(data))
  .handler(async ({ data, context }) => {
    const [{ assertAdminRole }, { fetchContactSubmissions }] = await Promise.all([
      import("./admin.server"),
      import("./contact-admin.server"),
    ]);
    await assertAdminRole(context.userId);
    return fetchContactSubmissions(data);
  });

export const analyzeContactMessage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => contactTriageInput.parse(data))
  .handler(async ({ data, context }) => {
    const { analyzeContactForSupport } = await import("./contact-triage.server");
    return analyzeContactForSupport(context.userId, data);
  });
