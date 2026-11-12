import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

export const getConsoleTourSeen = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    const rows = await sql`select display_prefs->>'consoleTourSeen' as seen from public.profiles where id = ${context.userId}`;
    return rows[0]?.seen === "true";
  });

export const markConsoleTourSeen = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`update public.profiles set display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb), '{consoleTourSeen}', 'true'::jsonb, true) where id = ${context.userId}`;
    return { ok: true };
  });
