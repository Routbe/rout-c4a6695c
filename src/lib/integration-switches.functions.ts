import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

async function gate(userId: string) {
  const { isPublicMode } = await import("./app-mode");
  if (isPublicMode()) throw new Error("Forbidden");
  const { assertAdminPermission } = await import("./admin-access.server");
  await assertAdminPermission(userId, "manage_integrations");
}

export const adminListSwitches = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await gate(context.userId);
    const { listSwitches } = await import("./integration-switches.server");
    return listSwitches();
  });

export const adminSetSwitch = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({
      provider: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/),
      mode: z.enum(["on", "paused", "off"]),
      note: z.string().max(300).nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await gate(context.userId);
    const { setSwitch } = await import("./integration-switches.server");
    await setSwitch({ adminId: context.userId, ...data });
    return { ok: true };
  });

export const adminFlushIntegrationCache = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ provider: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await gate(context.userId);
    const { flushCache } = await import("./integration-switches.server");
    await flushCache({ adminId: context.userId, provider: data.provider });
    return { ok: true };
  });
