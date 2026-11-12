/**
 * Combineert promocode en referral-beloning: het lid betaalt altijd de laagste
 * van de twee. Server-only, zodat een aangepaste client nooit zijn eigen
 * korting kan verzinnen. De basisprijs en de toeslag per betaalmethode komen
 * uit het dynamische prijsbeheer (`pricing_settings`).
 */
import {
  methodFeeCents,
  priceAfterPromo,
  type CheckoutMethod,
  type PromoDiscount,
} from "./checkout-pricing";

export async function bestPriceCents(
  method: CheckoutMethod,
  promo: PromoDiscount | null,
  userId: string,
): Promise<number> {
  const { getPricing } = await import("./pricing-settings.server");
  const pricing = await getPricing();
  const promoPrice = priceAfterPromo(method, promo, pricing);
  try {
    const { referralStatsFor } = await import("./referral.server");
    const { reward } = await referralStatsFor(userId);
    const base = Math.max(0, pricing.baseCents);
    const referralPrice =
      Math.max(0, base - Math.round((base * reward.percentOff) / 100)) +
      methodFeeCents(method, pricing);
    // New members who came in through an invite get 10% off (inviter rewards above still apply to inviters).
    const { inviteePriceCents } = await import("./referral-rewards");
    const { sql } = await import("./neon");
    const rows = (await sql`select referred_by from public.profiles where id = ${userId} limit 1`) as { referred_by: string | null }[];
    const referred = !!rows[0]?.referred_by;
    const inviteePrice = inviteePriceCents(base, referred) + methodFeeCents(method, pricing);
    return Math.min(promoPrice, referralPrice, inviteePrice);
  } catch {
    return promoPrice;
  }
}
