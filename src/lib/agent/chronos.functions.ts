import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Chronos timeline for the workspace settings UI. Owner/admin only. */
export const listWorkspaceAgentAudit = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { listAgentAudit } = await import("./chronos.server");
    return listAgentAudit(context.userId, data.workspaceId);
  });
