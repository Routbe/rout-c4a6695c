import { describe, expect, it, vi } from "vitest";
import {
  WALLET_TOPUP_TIERS_CENTS,
  normaliseAutoTopupCents,
  verifiedTopupCredit,
  walletTopupAmountSchema,
} from "@/lib/wallet-tiers";

vi.mock("@/lib/auth/middleware", () => ({ requireAuth: {} }));

describe("wallet top-up tiers", () => {
  it("allows exactly €10, €25, €50, €100 and €250", () => {
    expect([...WALLET_TOPUP_TIERS_CENTS]).toEqual([1000, 2500, 5000, 10000, 25000]);
    for (const cents of [1000, 2500, 5000, 10000, 25000]) {
      expect(walletTopupAmountSchema.safeParse(cents).success).toBe(true);
    }
  });

  it("rejects amounts below €10, above €250 and in between tiers", () => {
    for (const cents of [0, -1000, 300, 999, 1001, 2000, 7500, 25001, 30000, 1000.5]) {
      expect(walletTopupAmountSchema.safeParse(cents).success).toBe(false);
    }
  });

  it("rejects manipulated checkout requests with extra fields", async () => {
    const { topupSchema } = await import("@/lib/wallet.functions");
    expect(topupSchema.safeParse({ amountCents: 2500, origin: "https://rout.be" }).success).toBe(true);
    expect(topupSchema.safeParse({ amountCents: 2600, origin: "https://rout.be" }).success).toBe(false);
    expect(
      topupSchema.safeParse({ amountCents: 2500, origin: "https://rout.be", userId: "other" }).success,
    ).toBe(false);
  });

  it("credits only when Stripe confirms exactly the requested tier in EUR", () => {
    expect(verifiedTopupCredit({ requestedCents: "5000", paidCents: 5000, currency: "eur" })).toBe(5000);
    expect(verifiedTopupCredit({ requestedCents: "5000", paidCents: 100, currency: "eur" })).toBeNull();
    expect(verifiedTopupCredit({ requestedCents: "999999", paidCents: 999999, currency: "eur" })).toBeNull();
    expect(verifiedTopupCredit({ requestedCents: "5000", paidCents: 5000, currency: "usd" })).toBeNull();
    expect(verifiedTopupCredit({ requestedCents: "5000", paidCents: undefined, currency: "eur" })).toBeNull();
  });

  it("maps old saved auto top-up amounts to the nearest tier", () => {
    expect(normaliseAutoTopupCents(500)).toBe(1000);
    expect(normaliseAutoTopupCents(20000)).toBe(25000);
    expect(normaliseAutoTopupCents(5000)).toBe(5000);
  });
});
