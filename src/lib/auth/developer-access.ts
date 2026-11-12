import { createMiddleware } from "@tanstack/react-start";
import { requireAuth } from "./middleware";

/**
 * Developer Console / API & Webhooks guard: signed in, and in the active
 * workspace the role must be owner, admin or developer (editors get Forbidden).
 * Personal context keeps full access to one's own apps.
 */
export const requireDeveloperAccess = createMiddleware({ type: "function" })
  .middleware([requireAuth])
  .server(async ({ next, context }) => {
    const { resolveActiveWorkspace } = await import("@/lib/workspaces.server");
    const { canUseDeveloperTools } = await import("@/lib/workspace-rules");
    const active = await resolveActiveWorkspace(context.userId);
    if (!canUseDeveloperTools(active.role)) throw new Error("Forbidden");
    return next({ context: { activeWorkspaceId: active.workspaceId, workspaceRole: active.role } });
  });
