import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { SETTABLE_STATUSES } from "./admin-members-rules";

async function admin(userId: string) {
  const { assertAdminRole } = await import("./admin.server");
  await assertAdminRole(userId);
}

export const adminGetMember360 = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { getMember360 } = await import("./admin-members.server");
    return getMember360(data.userId);
  });

export const adminSetMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), status: z.enum(SETTABLE_STATUSES) }).parse(d))
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    if (data.userId === context.userId) throw new Error("Je kunt je eigen account niet modereren.");
    const { setMemberStatus } = await import("./admin-members.server");
    return setMemberStatus(context.userId, data.userId, data.status);
  });

export const adminListOAuthApps = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await admin(context.userId);
    const { listOAuthApps } = await import("./admin-members.server");
    return listOAuthApps();
  });

export const adminActOnOAuthApp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), action: z.enum(["approve", "reject", "block", "unblock"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { actOnOAuthApp } = await import("./admin-members.server");
    return actOnOAuthApp(context.userId, data.id, data.action);
  });

/** Workspaces a member belongs to (for the direct business grant). */
export const adminListUserWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { listUserWorkspaces } = await import("./admin-grant.server");
    return listUserWorkspaces(data.userId);
  });

/** Admin verifies a member directly (Pro, Influencer or Business), without a request. */
export const adminGrantVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        tier: z.enum(["pro", "influencer", "business"]),
        firstName: z.string().max(80).optional(),
        lastName: z.string().max(80).optional(),
        domain: z.string().max(253).optional(),
        workspaceId: z.string().uuid().optional(),
        workspaceName: z.string().max(80).optional(),
        exceptions: z.array(z.string().max(40)).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { grantVerification } = await import("./admin-grant.server");
    return grantVerification({ ...data, adminId: context.userId });
  });
