import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
const areaSchema = z.object({ area: z.enum(["studio", "dashboard", "commandCenter", "agenda", "identity"]) });
export const getFirstUseTour = createServerFn({ method: "GET" })
  .middleware([requireAuth]).inputValidator((data) => areaSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { sql } = await import("./neon");
    const rows = await sql`select display_prefs->'firstUseTours' as tours from public.profiles where id = ${context.userId} limit 1`;
    const tours = rows[0]?.tours as Record<string, unknown> | undefined;
    return { seen: tours?.[data.area] === true };
  });
export const completeFirstUseTour = createServerFn({ method: "POST" })
  .middleware([requireAuth]).inputValidator((data) => areaSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { sql } = await import("./neon");
    await sql`update public.profiles set display_prefs = jsonb_set(
      coalesce(display_prefs, '{}'::jsonb), '{firstUseTours}',
      coalesce(display_prefs->'firstUseTours', '{}'::jsonb) || jsonb_build_object(${data.area}::text, true), true)
      where id = ${context.userId}`;
    return { ok: true };
  });