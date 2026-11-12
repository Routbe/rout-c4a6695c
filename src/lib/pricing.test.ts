import { describe, expect, it } from "vitest";
import { DONATION_PLANS, EARLY_BELIEVER_CENTS, euro, VERIFICATION_TIERS } from "./profile";
import {
  DONATION_PLAN_CENTS,
  DONATION_PLAN_INTERVAL,
  MAX_DONATION_CENTS,
  TIER_AMOUNTS,
  clampDonation,
  normalizeDonationPlan,
} from "./verification.server";

const earlyBeliever = VERIFICATION_TIERS.find((t) => t.id === "early_believer")!;

describe("Early Believer pricing", () => {
  it("is a single one-time €3.99 tier", () => {
    expect(VERIFICATION_TIERS).toHaveLength(1);
    expect(earlyBeliever.amountCents).toBe(399);
    expect(earlyBeliever.instantSurchargeCents).toBe(0);
    expect(euro(earlyBeliever.amountCents)).toBe("€3,99");
  });

  it("keeps the client and server price in sync", () => {
    expect(TIER_AMOUNTS.early_believer).toBe(EARLY_BELIEVER_CENTS);
    expect(earlyBeliever.amountCents).toBe(TIER_AMOUNTS.early_believer);
  });
});

describe("Keep ROUT Alive donation plans", () => {
  it("offers none / €1 monthly / €12 yearly minimums", () => {
    expect(DONATION_PLANS.map((p) => p.id)).toEqual(["none", "one_time", "monthly", "yearly"]);
    expect(DONATION_PLAN_CENTS).toEqual({ none: 0, one_time: 100, monthly: 100, yearly: 1200 });
    expect(DONATION_PLAN_INTERVAL.one_time).toBeNull();
    expect(DONATION_PLAN_INTERVAL.monthly).toBe("month");
    expect(DONATION_PLAN_INTERVAL.yearly).toBe("year");
    expect(DONATION_PLAN_INTERVAL.none).toBeNull();
  });

  it("mirrors the server amounts on the client", () => {
    for (const plan of DONATION_PLANS) {
      expect(plan.cents).toBe(DONATION_PLAN_CENTS[plan.id]);
      expect(plan.interval).toBe(DONATION_PLAN_INTERVAL[plan.id]);
    }
  });

  it("falls back to no donation for unknown values", () => {
    expect(normalizeDonationPlan("weekly")).toBe("none");
    expect(normalizeDonationPlan("one_time")).toBe("one_time");
    expect(normalizeDonationPlan(null)).toBe("none");
    expect(normalizeDonationPlan("yearly")).toBe("yearly");
  });
});

describe("one-off donation clamping", () => {
  it("never goes below zero or above the cap", () => {
    expect(clampDonation(-500)).toBe(0);
    expect(clampDonation(NaN)).toBe(0);
    expect(clampDonation(250)).toBe(250);
    expect(clampDonation(MAX_DONATION_CENTS + 1)).toBe(MAX_DONATION_CENTS);
  });
});
