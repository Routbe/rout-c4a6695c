import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

const id = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error("bad_id");
  return s;
};

export const listDesignTemplates = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listTemplates } = await import("./design-templates.server");
    return listTemplates(context.userId);
  });

export const saveCurrentDesign = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { name?: string } | undefined) => ({ name: input?.name?.slice(0, 60) ?? null }))
  .handler(async ({ data, context }) => {
    const { saveTemplate } = await import("./design-templates.server");
    return { ok: Boolean(await saveTemplate(context.userId, data.name)) };
  });

export const applyDesignTemplate = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string }) => ({ id: id(input?.id) }))
  .handler(async ({ data, context }) => {
    const { applyTemplate } = await import("./design-templates.server");
    return { ok: await applyTemplate(context.userId, data.id) };
  });

export const renameDesignTemplate = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string; name: string }) => ({ id: id(input?.id), name: String(input?.name ?? "") }))
  .handler(async ({ data, context }) => {
    if (!data.name.trim()) return { ok: false };
    const { renameTemplate } = await import("./design-templates.server");
    await renameTemplate(context.userId, data.id, data.name);
    return { ok: true };
  });

export const deleteDesignTemplate = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string }) => ({ id: id(input?.id) }))
  .handler(async ({ data, context }) => {
    const { deleteTemplate } = await import("./design-templates.server");
    await deleteTemplate(context.userId, data.id);
    return { ok: true };
  });
