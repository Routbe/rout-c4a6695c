import { describe, expect, it } from "vitest";
import {
  donationPaymentMatches,
  resolveDonationAmount,
  resolveTipAmount,
} from "./payment-amount-policy";

describe("resolveDonationAmount", () => {
  it("accepts presets and bounded custom amounts on the 50-cent grid", () => {
    expect(resolveDonationAmount(1000)).toBe(1000);
    expect(resolveDonationAmount(250)).toBe(250);
    expect(resolveDonationAmount(100)).toBe(100);
    expect(resolveDonationAmount(500_000)).toBe(500_000);
  });
  it("refuses out-of-range, off-grid and non-integer amounts", () => {
    expect(resolveDonationAmount(99)).toBeNull();
    expect(resolveDonationAmount(0)).toBeNull();
    expect(resolveDonationAmount(-500)).toBeNull();
    expect(resolveDonationAmount(500_050)).toBeNull();
    expect(resolveDonationAmount(123)).toBeNull();
    expect(resolveDonationAmount(250.5)).toBeNull();
    expect(resolveDonationAmount("1000")).toBeNull();
    expect(resolveDonationAmount(Number.NaN)).toBeNull();
  });
});

describe("resolveTipAmount", () => {
  const rules = { presetsCents: [500, 1000, 2500], allowCustom: false, minCents: 300 };
  it("only charges creator presets when custom amounts are off", () => {
    expect(resolveTipAmount(1000, rules)).toBe(1000);
    expect(resolveTipAmount(1200, rules)).toBeNull();
    expect(resolveTipAmount(100, rules)).toBeNull();
  });
  it("respects the creator minimum and platform maximum for custom amounts", () => {
    const open = { ...rules, allowCustom: true };
    expect(resolveTipAmount(1234, open)).toBe(1234);
    expect(resolveTipAmount(299, open)).toBeNull();
    expect(resolveTipAmount(500_001, open)).toBeNull();
    expect(resolveTipAmount(12.5, open)).toBeNull();
  });
});

describe("donationPaymentMatches", () => {
  it("requires the exact stored amount in EUR", () => {
    expect(donationPaymentMatches(1000, 1000, "eur")).toBe(true);
    expect(donationPaymentMatches(1000, 1000, "EUR")).toBe(true);
    expect(donationPaymentMatches(1000, 999, "eur")).toBe(false);
    expect(donationPaymentMatches(1000, 0, "eur")).toBe(false);
    expect(donationPaymentMatches(1000, 1000, "usd")).toBe(false);
    expect(donationPaymentMatches(1000, undefined, "eur")).toBe(false);
  });
});

import { bankRequestAmountCents } from "./payment-amount-policy";

describe("bankRequestAmountCents", () => {
  it("charges the member's stored open payment (base + contribution)", () => {
    expect(bankRequestAmountCents({ amountCents: 399, donationCents: 100 }, 999)).toBe(499);
  });
  it("falls back to the server's standard price without a stored payment", () => {
    expect(bankRequestAmountCents(null, 399)).toBe(399);
  });
  it("refuses a zero or invalid amount", () => {
    expect(bankRequestAmountCents({ amountCents: 0, donationCents: 0 }, 399)).toBeNull();
    expect(bankRequestAmountCents({ amountCents: "abc", donationCents: 0 }, 399)).toBeNull();
  });
});
