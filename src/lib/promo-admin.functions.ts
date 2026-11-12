import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Creates a promo code and (optionally) mails it to the customer. Admin only. */
export const createPromoCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        code: z.string().trim().max(64).optional(),
        label: z.string().trim().max(120).optional(),
        percentOff: z.number().int().min(0).max(100).optional(),
        amountOffCents: z.number().int().min(0).max(1_000_000).optional(),
        maxDiscountCents: z.number().int().min(0).max(1_000_000).optional(),
        maxRedemptions: z.number().int().min(0).max(100_000).optional(),
        expiresAt: z.string().trim().max(40).optional(),
        email: z.string().trim().email().max(255).optional().or(z.literal("")),
        phone: z.string().trim().max(24).optional().or(z.literal("")),
        language: z.enum(["nl", "en", "fr", "de"]).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { createPromoAndInvite } = await import("./promo-admin.server");
    return createPromoAndInvite(data);
  });

/** Recent promo codes for the admin overview. */
export const listPromos = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { listPromoCodes } = await import("./promo-admin.server");
    return listPromoCodes();
  });
