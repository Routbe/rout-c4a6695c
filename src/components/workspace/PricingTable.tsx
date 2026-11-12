import { Button } from "@/components/ui/button";
import { PricingCard } from "./PricingCard";
import { PricingFeatureTable } from "./PricingFeatureTable";
import { WORKSPACE_PRICING, recommendedWorkspacePlan, recommendationLabel, type WorkspacePlanId, type BillingCycle } from "@/lib/workspace-pricing";

export function PricingTable({ category, planId, billingCycle, onPlanChange, onCycleChange }: {
  category: string | null; planId: WorkspacePlanId; billingCycle: BillingCycle;
  onPlanChange: (id: WorkspacePlanId) => void; onCycleChange: (cycle: BillingCycle) => void;
}) {
  const recommended = recommendedWorkspacePlan(category);
  return <div>
    <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
      <div className="inline-flex rounded-lg border border-border bg-muted/50 p-1" role="group" aria-label="Facturatieperiode">
        <Button type="button" variant={billingCycle === "monthly" ? "default" : "ghost"} size="sm" aria-pressed={billingCycle === "monthly"} onClick={() => onCycleChange("monthly")}>Maandelijks</Button>
        <Button type="button" variant={billingCycle === "yearly" ? "default" : "ghost"} size="sm" aria-pressed={billingCycle === "yearly"} onClick={() => onCycleChange("yearly")}>Jaarlijks</Button>
      </div>
      <span className="rounded-md bg-highlight px-2.5 py-1.5 text-xs font-medium text-highlight-foreground">2 maanden gratis</span>
    </div>
    <div className="workspace-pricing-grid grid auto-cols-[minmax(260px,85%)] grid-flow-col gap-4 overflow-x-auto px-2 pb-5 pt-3 lg:grid-flow-row lg:grid-cols-4 lg:overflow-visible">
      {WORKSPACE_PRICING.map(plan => <PricingCard key={plan.id} plan={plan} cycle={billingCycle} selected={planId === plan.id} recommended={recommended === plan.id} badge={recommendationLabel(recommended)} onSelect={() => onPlanChange(plan.id)} />)}
    </div>
    <PricingFeatureTable />
    <p className="mt-4 text-xs leading-5 text-muted-foreground">Je kiest hier je planvoorkeur. De workspace start op Starter; betaalde functies worden pas actief na bevestiging via een beschikbare betaalroute.</p>
  </div>;
}