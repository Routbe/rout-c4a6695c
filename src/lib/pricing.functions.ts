import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Publieke prijslijst voor de checkout (basisprijs, toeslagen, minimum donatie). */
export const getPricingSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { getPricing } = await import("./pricing-settings.server");
  return getPricing();
});

const pricingSchema = z.object({
  baseCents: z.number().int().min(0).max(1_000_000),
  feeCard: z.number().int().min(0).max(1_000_000),
  feeBunq: z.number().int().min(0).max(1_000_000),
  feeSepa: z.number().int().min(0).max(1_000_000),
  minDonationCents: z.number().int().min(1).max(1_000_000),
});

/** Beheerders passen de tarieven aan; validatie weert negatieve bedragen. */
export const savePricingSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => pricingSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { savePricing } = await import("./pricing-settings.server");
    const saved = await savePricing(
      {
        baseCents: data.baseCents,
        feeCents: { card: data.feeCard, bunq: data.feeBunq, sepa: data.feeSepa },
        minDonationCents: data.minDonationCents,
      },
      context.userId,
    );
    return { ok: true as const, pricing: saved };
  });
