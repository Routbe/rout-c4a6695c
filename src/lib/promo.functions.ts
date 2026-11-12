import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * Controleert een promocode voor de afrekenkaart. De echte korting wordt bij
 * het afrekenen opnieuw server-side berekend; dit is enkel de UI-bevestiging.
 */
export const validatePromoCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ code: z.string().max(64) }).parse(data))
  .handler(async ({ data }) => {
    const { resolvePromo } = await import("./promo.server");
    const promo = await resolvePromo(data.code);
    if (!promo) return { ok: false as const, reason: "invalid" as const };
    return { ok: true as const, promo };
  });
