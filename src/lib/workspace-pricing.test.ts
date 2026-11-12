import { describe, expect, it } from "vitest";
import { WORKSPACE_PRICING, planAmountCents, recommendedWorkspacePlan, workspaceBillingSchema } from "./workspace-pricing";
describe("workspace pricing", () => {
  const expected = [
    ["tier_starter", 0, 0, 0, 1, 5],
    ["tier_core", 399, 3990, 5120, 3, 50],
    ["tier_pro", 799, 7990, 51200, 10, null],
    ["tier_max", 1999, 19990, 256000, null, null],
  ] as const;
  for (const [id, month, year, storage, apps, qr] of expected) {
    it(`${id} has the exact requested monthly price`, () => { expect(WORKSPACE_PRICING.find(p => p.id === id)?.monthlyCents).toBe(month); });
    it(`${id} bills ten months per year`, () => { const plan = WORKSPACE_PRICING.find(p => p.id === id); if (!plan) throw new Error("Missing plan"); expect(planAmountCents(plan, "yearly")).toBe(year); });
    it(`${id} has the requested storage quota`, () => { expect(WORKSPACE_PRICING.find(p => p.id === id)?.storageMb).toBe(storage); });
    it(`${id} has the requested OIDC limit`, () => { expect(WORKSPACE_PRICING.find(p => p.id === id)?.oidcApps).toBe(apps); });
    it(`${id} has the requested QR limit`, () => { expect(WORKSPACE_PRICING.find(p => p.id === id)?.qrCodes).toBe(qr); });
  }
  for (const [category, id] of [["business", "tier_pro"], ["event", "tier_pro"], ["agency", "tier_max"], ["project", "tier_core"], ["nonprofit", "tier_core"]]) {
    it(`recommends ${id} for ${category}`, () => expect(recommendedWorkspacePlan(category)).toBe(id));
  }
  it("passes both selected tier and billing cycle through validation", () => {
    expect(workspaceBillingSchema.parse({ plan_id: "tier_pro", billing_cycle: "yearly" })).toEqual({ plan_id: "tier_pro", billing_cycle: "yearly" });
  });
  it("rejects arbitrary tier IDs", () => expect(workspaceBillingSchema.safeParse({ plan_id: "paid_admin", billing_cycle: "monthly" }).success).toBe(false));
  it("rejects arbitrary billing periods", () => expect(workspaceBillingSchema.safeParse({ plan_id: "tier_pro", billing_cycle: "weekly" }).success).toBe(false));
});