/**
 * Server-owned amount policies for pay-what-you-want flows (creator donations
 * and creator tips). The browser only *proposes* an amount; these functions
 * decide which amount is charged, from server-side rules or the creator's own
 * saved settings. Pure (no I/O) so they are unit-testable and shared.
 */

export const DONATION_PRESETS = [500, 1000, 2500, 5000] as const;
export const MIN_DONATION_CENTS = 100;
export const MAX_DONATION_CENTS = 500_000;
/** Custom donation amounts are charged in whole 50-cent steps only. */
export const DONATION_STEP_CENTS = 50;

export const MAX_TIP_CENTS = 500_000;

function asWholeCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return null;
  return value;
}

/**
 * Resolves the amount ROUT will charge for a creator donation. Presets are
 * always accepted; custom amounts must sit inside the platform range and on
 * the 50-cent grid. Anything else is refused (never silently adjusted).
 */
export function resolveDonationAmount(requested: unknown): number | null {
  const cents = asWholeCents(requested);
  if (cents === null) return null;
  if ((DONATION_PRESETS as readonly number[]).includes(cents)) return cents;
  if (cents < MIN_DONATION_CENTS || cents > MAX_DONATION_CENTS) return null;
  if (cents % DONATION_STEP_CENTS !== 0) return null;
  return cents;
}

export type TipAmountRules = {
  presetsCents: readonly number[];
  allowCustom: boolean;
  minCents: number;
};

/**
 * Resolves a tip amount from the CREATOR's saved settings: when custom amounts
 * are off only their presets can be charged; otherwise the amount must respect
 * their minimum and the platform maximum.
 */
export function resolveTipAmount(requested: unknown, rules: TipAmountRules): number | null {
  const cents = asWholeCents(requested);
  if (cents === null || cents <= 0 || cents > MAX_TIP_CENTS) return null;
  const presets = rules.presetsCents.filter((p) => Number.isInteger(p) && p > 0 && p <= MAX_TIP_CENTS);
  if (presets.includes(cents) && cents >= rules.minCents) return cents;
  if (!rules.allowCustom) return null;
  if (cents < rules.minCents) return null;
  return cents;
}

/**
 * Amount for a bank payment request (bunq.me fallback of a bank transfer).
 * Never taken from the browser: it is the member's own stored pending payment
 * (base + one-off contribution) or, without one, the server's standard price.
 */
export function bankRequestAmountCents(
  stored: { amountCents: unknown; donationCents: unknown } | null,
  standardPriceCents: number,
): number | null {
  const total = stored
    ? Number(stored.amountCents ?? 0) + Number(stored.donationCents ?? 0)
    : standardPriceCents;
  if (!Number.isInteger(total) || total <= 0) return null;
  return total;
}

/**
 * A donation may only be marked paid when Stripe actually collected exactly
 * the stored amount in EUR.
 */
export function donationPaymentMatches(
  storedCents: number,
  paidCents: unknown,
  currency: unknown,
): boolean {
  return (
    typeof paidCents === "number" &&
    Number.isInteger(paidCents) &&
    paidCents === storedCents &&
    typeof currency === "string" &&
    currency.toLowerCase() === "eur"
  );
}
