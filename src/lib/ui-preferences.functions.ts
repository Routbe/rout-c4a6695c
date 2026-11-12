import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Account copies of UI preferences (workspace material, last Studio profile), in profiles.display_prefs.workspaceUi. */
const materialSchema = z.object({ material: z.enum(["mechanical", "glass"]) });

export const getAccountUiMaterial = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("./neon");
    const rows = await sql`select display_prefs->'workspaceUi'->>'material' as material from public.profiles where id = ${context.userId} limit 1`;
    const material = rows[0]?.["material"];
    return { material: material === "mechanical" || material === "glass" ? material : null };
  });

export const saveAccountUiMaterial = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) => materialSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { sql } = await import("./neon");
    await sql`update public.profiles set display_prefs = jsonb_set(
      coalesce(display_prefs, '{}'::jsonb), '{workspaceUi}',
      coalesce(display_prefs->'workspaceUi', '{}'::jsonb) || jsonb_build_object('material', ${data.material}::text), true)
      where id = ${context.userId}`;
    return { ok: true };
  });

const studioVariantSchema = z.object({ variant: z.enum(["alias", "verified"]) });

/** Last opened Studio profile (private alias or verified), so every device reopens the same one. */
export const getAccountStudioVariant = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("./neon");
    const rows = await sql`select display_prefs->'workspaceUi'->>'studioVariant' as variant from public.profiles where id = ${context.userId} limit 1`;
    const variant = rows[0]?.["variant"];
    return { variant: variant === "alias" || variant === "verified" ? variant : null };
  });

export const saveAccountStudioVariant = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) => studioVariantSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { sql } = await import("./neon");
    await sql`update public.profiles set display_prefs = jsonb_set(
      coalesce(display_prefs, '{}'::jsonb), '{workspaceUi}',
      coalesce(display_prefs->'workspaceUi', '{}'::jsonb) || jsonb_build_object('studioVariant', ${data.variant}::text), true)
      where id = ${context.userId}`;
    return { ok: true };
  });
