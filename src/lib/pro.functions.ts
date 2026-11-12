import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** Is the caller on the ROUT Pro waitlist? */
export const getProWaitlist = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`select 1 from public.pro_waitlist where user_id = ${context.userId} limit 1`) as unknown[];
    return { joined: rows.length > 0 };
  });

/** Adds the caller to the ROUT Pro waitlist (idempotent). */
export const joinProWaitlist = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`insert into public.pro_waitlist (user_id) values (${context.userId}) on conflict do nothing`;
    return { joined: true };
  });
