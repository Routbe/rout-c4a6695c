/**
 * "Keep ROUT Alive" recurring contributions — client-safe rules shared by the
 * checkout UI and the server.
 *
 * The frequency is mutually exclusive (monthly OR yearly, never both) and a
 * strict minimum applies: €1.00 per month, or the proportional €12.00 per year.
 */
import type { DonationPlan } from "./profile";

export const MIN_MONTHLY_CENTS = 100;
export const MIN_YEARLY_CENTS = 1200;
/** Upper bound so a typo cannot create a €10.000 subscription. */
export const MAX_CONTRIBUTION_CENTS = 100_000;

export const MIN_ONE_TIME_CENTS = 100;

export function minContributionCents(
  plan: DonationPlan,
  minDonationCents = MIN_ONE_TIME_CENTS,
): number {
  if (plan === "monthly") return Math.max(minDonationCents, MIN_MONTHLY_CENTS);
  if (plan === "yearly") return Math.max(minDonationCents * 12, MIN_YEARLY_CENTS);
  if (plan === "one_time") return Math.max(1, minDonationCents);
  return 0;
}

/** Clamps a chosen contribution into the allowed range for its frequency. */
export function clampContribution(plan: DonationPlan, cents: number | null | undefined): number {
  if (plan === "none") return 0;
  const min = minContributionCents(plan);
  if (!Number.isFinite(cents ?? NaN)) return min;
  return Math.min(Math.max(Math.round(cents as number), min), MAX_CONTRIBUTION_CENTS);
}

/** Human error for an out-of-range custom amount, or `null` when it is valid. */
export function contributionError(plan: DonationPlan, cents: number | null): string | null {
  if (plan === "none") return null;
  if (cents === null || !Number.isFinite(cents)) return "Enter an amount.";
  const min = minContributionCents(plan);
  if (cents < min) {
    if (plan === "one_time") return "The minimum extra contribution is €1.00.";
    return plan === "monthly"
      ? "The minimum contribution is €1.00 per month."
      : "The minimum contribution is €12.00 per year (€1.00 / month).";
  }
  if (cents > MAX_CONTRIBUTION_CENTS) return "That is above the €1000 maximum.";
  return null;
}

/** i18n key + params for an invalid amount, or `null` when it is valid. */
export function contributionErrorKey(
  plan: DonationPlan,
  cents: number | null,
): { key: string; params?: Record<string, unknown> } | null {
  if (plan === "none") return null;
  if (cents === null || !Number.isFinite(cents)) return { key: "contrib.err.empty" };
  if (cents < minContributionCents(plan)) {
    return {
      key:
        plan === "one_time"
          ? "contrib.err.minOneTime"
          : plan === "monthly"
            ? "contrib.err.minMonthly"
            : "contrib.err.minYearly",
    };
  }
  if (cents > MAX_CONTRIBUTION_CENTS) return { key: "contrib.err.max" };
  return null;
}

export function intervalLabel(plan: DonationPlan): "month" | "year" | null {
  if (plan === "monthly") return "month";
  if (plan === "yearly") return "year";
  return null;
}
