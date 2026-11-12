import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * Entitlement snapshot for the signed-in member. Used by the client route
 * guards on the Domains / Bluesky surfaces; the server functions behind those
 * screens re-check independently, so this is UX, not the security boundary.
 */
export const getMyEntitlement = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { loadEntitlement } = await import("./entitlement.server");
    const e = await loadEntitlement(context.userId);
    return {
      entitled: e.entitled,
      verified: e.verified,
      isPaid: e.isPaid,
      legalName: e.legalName,
      username: e.username,
    };
  });
