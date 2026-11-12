import { useState } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PricingTable } from "./PricingTable";
import type { BillingCycle, WorkspacePlanId } from "@/lib/workspace-pricing";
afterEach(cleanup);
function Harness({ category }: { category: string }) {
  const [plan, setPlan] = useState<WorkspacePlanId>("tier_starter");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  return <><PricingTable category={category} planId={plan} billingCycle={cycle} onPlanChange={setPlan} onCycleChange={setCycle} /><output aria-label="Selection">{plan}/{cycle}</output></>;
}
it("preserves selected plan while changing billing cycle", () => {
  render(<Harness category="business" />);
  fireEvent.click(screen.getByRole("button", { name: "Kies Pro" }));
  fireEvent.click(screen.getByRole("button", { name: "Jaarlijks" }));
  expect(screen.getByLabelText("Selection").textContent).toBe("tier_pro/yearly");
});
it("changing category does not overwrite the user's selection", () => {
  const view = render(<Harness category="business" />);
  fireEvent.click(screen.getByRole("button", { name: "Kies Core" }));
  view.rerender(<Harness category="agency" />);
  expect(screen.getByLabelText("Selection").textContent).toBe("tier_core/monthly");
});