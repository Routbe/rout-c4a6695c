/**
 * Dynamisch prijsbeleid — client-safe types en defaults.
 *
 * De echte waarden staan in de tabel `public.pricing_settings` en worden door
 * `pricing-settings.server.ts` gelezen (met cache). Deze module bevat alleen de
 * vorm + de fallback-defaults, zodat de checkout ook werkt wanneer de tabel nog
 * niet bestaat of de database even niet bereikbaar is.
 */

export type CheckoutMethod = "card" | "bunq" | "sepa";

export interface PricingSettings {
  /** Basisprijs van de levenslange verificatie, in centen. */
  baseCents: number;
  /** Toeslag per betaalmethode, in centen. */
  feeCents: Record<CheckoutMethod, number>;
  /** Minimale (eenmalige of terugkerende) bijdrage, in centen. */
  minDonationCents: number;
}

export const DEFAULT_PRICING: PricingSettings = {
  baseCents: 399,
  feeCents: { card: 999, bunq: 499, sepa: 0 },
  minDonationCents: 100,
};

/** Toeslag van één betaalmethode, met defaults als fallback. */
export function methodFeeCents(
  method: CheckoutMethod,
  pricing: PricingSettings = DEFAULT_PRICING,
): number {
  return Math.max(0, pricing.feeCents[method] ?? 0);
}

/** Basisprijs + toeslag van de gekozen betaalmethode. */
export function methodPriceCents(
  method: CheckoutMethod,
  pricing: PricingSettings = DEFAULT_PRICING,
): number {
  return Math.max(0, pricing.baseCents) + methodFeeCents(method, pricing);
}

/** Normaliseert losse (mogelijk negatieve of ontbrekende) waarden. */
export function sanitizePricing(input: Partial<PricingSettings> | null): PricingSettings {
  const clamp = (value: unknown, fallback: number) =>
    Number.isFinite(value as number) ? Math.max(0, Math.round(value as number)) : fallback;
  return {
    baseCents: clamp(input?.baseCents, DEFAULT_PRICING.baseCents),
    feeCents: {
      card: clamp(input?.feeCents?.card, DEFAULT_PRICING.feeCents.card),
      bunq: clamp(input?.feeCents?.bunq, DEFAULT_PRICING.feeCents.bunq),
      sepa: clamp(input?.feeCents?.sepa, DEFAULT_PRICING.feeCents.sepa),
    },
    minDonationCents: Math.max(1, clamp(input?.minDonationCents, DEFAULT_PRICING.minDonationCents)),
  };
}
