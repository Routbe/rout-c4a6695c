import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth/middleware";

export const getCommandOverview = createServerFn({ method: "GET" }).middleware([requireAuth]).handler(async ({ context }) => {
  const { assertAdminRole } = await import("./admin.server");
  await assertAdminRole(context.userId);
  const { commandOverview } = await import("./admin-control.server");
  return commandOverview();
});
export const getFinanceOverview = createServerFn({ method: "POST" }).middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().trim().max(120).default(""), cursor: z.string().uuid().nullable().default(null) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { financeOverview } = await import("./admin-control.server");
    return financeOverview(data);
  });
export const getInfrastructureOverview = createServerFn({ method: "POST" }).middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["webhooks", "subdomains", "aliases"]), search: z.string().trim().max(120).default(""),
    status: z.enum(["all", "failed", "done", "success", "processing", "active", "pending", "paused"]).default("all"), cursor: z.string().max(400).nullable().default(null) })
    .superRefine((v, ctx) => {
      if (!v.cursor) return;
      if (v.kind === "aliases") {
        if (!/^(alias|profile):[0-9a-f-]{36}$/.test(v.cursor)) ctx.addIssue({ code: "custom", message: "Invalid cursor" });
      } else if (v.kind === "subdomains") {
        if (!z.string().uuid().safeParse(v.cursor).success) ctx.addIssue({ code: "custom", message: "Invalid cursor" });
      } else {
        try { z.object({ date: z.string().datetime(), id: z.string().max(200) }).parse(JSON.parse(v.cursor)); }
        catch { ctx.addIssue({ code: "custom", message: "Invalid cursor" }); }
      }
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { infrastructureOverview } = await import("./admin-control.server");
    return infrastructureOverview(data);
  });