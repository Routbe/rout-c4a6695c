/**
 * Prijsstructuur van de Early Believer-verificatie.
 *
 * De basisprijs en de toeslag per betaalmethode komen uit `pricing_settings`
 * (beheerbaar in het adminportaal); `DEFAULT_PRICING` is het vangnet. Deze
 * module is isomorf — server en client rekenen met exact dezelfde formule.
 */
import {
  DEFAULT_PRICING,
  methodFeeCents,
  methodPriceCents,
  type CheckoutMethod,
  type PricingSettings,
} from "./pricing-settings";

export type { CheckoutMethod, PricingSettings };
export { DEFAULT_PRICING, methodFeeCents, methodPriceCents };

export interface PromoDiscount {
  /** Genormaliseerde code, zoals de server hem kent. */
  code: string;
  /** Korte omschrijving voor in de UI, bv. "100% korting". */
  label: string;
  percentOff: number;
  amountOffCents: number;
  /** Optioneel plafond op de procentuele korting (bijv. 50% met max €10). */
  maxDiscountCents?: number | null;
}

/** Kortingsbedrag op één basisprijs, nooit meer dan de prijs zelf. */
export function discountCents(baseCents: number, promo: PromoDiscount | null): number {
  if (!promo) return 0;
  let percent = Math.round((baseCents * promo.percentOff) / 100);
  const cap = promo.maxDiscountCents;
  if (typeof cap === "number" && cap > 0) percent = Math.min(percent, cap);
  return Math.min(baseCents, percent + promo.amountOffCents);
}

/**
 * Prijs na korting voor de gekozen betaalmethode. De promocode werkt op de
 * basisprijs; de methode-toeslag komt daar onverkort bovenop.
 */
export function priceAfterPromo(
  method: CheckoutMethod,
  promo: PromoDiscount | null,
  pricing: PricingSettings = DEFAULT_PRICING,
): number {
  const base = Math.max(0, pricing.baseCents);
  const discounted = Math.max(0, base - discountCents(base, promo));
  return discounted + methodFeeCents(method, pricing);
}
