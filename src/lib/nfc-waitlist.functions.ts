import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Records the signed-in member's interest in an NFC business card. */
export const joinNfcWaitlist = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ material: z.enum(["wood", "metal", "matte_black"]).nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    try {
      await sql`insert into public.nfc_waitlist (user_id, material) values (${context.userId}, ${data.material})
                on conflict (user_id) do update set material = coalesce(excluded.material, public.nfc_waitlist.material)`;
      return { ok: true as const };
    } catch (e) {
      console.error("[nfc-waitlist] insert failed", e instanceof Error ? e.message : e);
      return { ok: false as const };
    }
  });
