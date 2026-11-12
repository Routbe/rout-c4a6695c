import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDeveloperAccess } from "./auth/developer-access";
import { eventInputSchema } from "./event-engine";

export const getMyEvents = createServerFn({ method: "GET" }).middleware([requireDeveloperAccess]).handler(async ({ context }) => {
  const { listEvents } = await import("./event-engine.server");
  return listEvents(context.userId, context.activeWorkspaceId);
});
export const createProfileEvent = createServerFn({ method: "POST" }).middleware([requireDeveloperAccess])
  .inputValidator((d: unknown) => eventInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { createEvent } = await import("./event-engine.server");
    return createEvent(context.userId, context.activeWorkspaceId, data);
  });
export const changeProfileEvent = createServerFn({ method: "POST" }).middleware([requireDeveloperAccess])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["publish", "delete"]), enabled: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { changeEvent } = await import("./event-engine.server");
    return changeEvent(context.userId, context.activeWorkspaceId, data.id, data.action, data.enabled);
  });
export const getPublicEvents = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().max(100).optional(), space: z.enum(["root", "alias", "workspace"]).optional(), handle: z.string().max(64).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { readPublicEvents } = await import("./event-engine.server");
    try { return await readPublicEvents(data.slug ?? null, data.space ?? null, data.handle ?? null); }
    catch (e) { console.error("public events", e); return []; }
  });
