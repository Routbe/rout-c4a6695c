import { Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPlanPrice, planAmountCents, quotaLabel, type BillingCycle, type WorkspacePricingPlan } from "@/lib/workspace-pricing";

export function PricingCard({ plan, cycle, selected, recommended, badge, onSelect }: {
  plan: WorkspacePricingPlan; cycle: BillingCycle; selected: boolean; recommended: boolean; badge: string; onSelect: () => void;
}) {
  const price = cycle === "yearly" ? Math.round(planAmountCents(plan, cycle) / 12) : plan.monthlyCents;
  return <div className={`workspace-pricing-card flex h-full flex-col rounded-lg border p-5 ${recommended ? "workspace-pricing-recommended border-primary" : "border-border bg-card/60"}`}>
    <div className="mb-5 min-h-12">
      {recommended ? <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-[11px] leading-4 text-primary-foreground"><CheckCircle2 className="size-3 shrink-0" />{badge}</span> : <span className="text-xs text-muted-foreground">{plan.id === "tier_starter" ? "Zonder verplichtingen" : plan.audience}</span>}
    </div>
    <h3 className="font-display text-3xl">{plan.label}</h3>
    <p className="mt-3 flex flex-wrap items-baseline gap-1"><span className="text-3xl font-semibold tabular-nums">{formatPlanPrice(price)}</span><span className="text-xs text-muted-foreground">/mnd</span></p>
    <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">{plan.monthlyCents === 0 ? "Gratis, zonder betaalgegevens" : cycle === "yearly" ? `${formatPlanPrice(planAmountCents(plan, cycle))} jaarlijks gefactureerd` : "Maandelijks gefactureerd"}</p>
    <Button type="button" variant={selected || recommended ? "default" : "outline"} className="mt-4 w-full" aria-pressed={selected} onClick={onSelect}>{selected ? <><Check className="size-4" /> Geselecteerd</> : `Kies ${plan.label}`}</Button>
    <ul className="mt-6 space-y-3 text-sm">
      {[plan.storageMb ? `${plan.storageMb / 1024} GB ${plan.id === "tier_max" ? "gedeelde " : ""}opslag` : "0 MB cloudopslag", `${quotaLabel(plan.oidcApps)} OIDC-app${plan.oidcApps === 1 ? "" : "s"}`, `${quotaLabel(plan.qrCodes)} QR-codes`, ...plan.features].map(feature => <li key={feature} className="flex items-start gap-2 leading-5"><Check className="mt-0.5 size-4 shrink-0 text-accent" /><span>{feature}</span></li>)}
    </ul>
    {plan.id === "tier_max" && <p className="mt-auto pt-5 text-xs leading-5 text-muted-foreground">Edge-Accelerated Profiles: infrastructuuractivatie vereist.</p>}
  </div>;
}