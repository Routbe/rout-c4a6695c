import { z } from "zod";

export const WORKSPACE_PLAN_IDS = ["tier_starter", "tier_core", "tier_pro", "tier_max"] as const;
export type WorkspacePlanId = typeof WORKSPACE_PLAN_IDS[number];
export type BillingCycle = "monthly" | "yearly";
export const workspaceBillingSchema = z.object({
  plan_id: z.enum(WORKSPACE_PLAN_IDS).default("tier_starter"),
  billing_cycle: z.enum(["monthly", "yearly"]).default("monthly"),
});
export type WorkspacePricingPlan = {
  id: WorkspacePlanId; label: string; audience: string; monthlyCents: number;
  storageMb: number; oidcApps: number | null; qrCodes: number | null;
  features: string[];
};
export const WORKSPACE_PRICING: readonly WorkspacePricingPlan[] = [
  { id: "tier_starter", label: "Starter", audience: "Persoonlijke projecten & tests", monthlyCents: 0, storageMb: 0, oidcApps: 1, qrCodes: 5,
    features: ["Basis Profiel Hub", "Standaard naam.rout.be-adres"] },
  { id: "tier_core", label: "Core", audience: "Creators & freelancers", monthlyCents: 399, storageMb: 5120, oidcApps: 3, qrCodes: 50,
    features: ["Bluesky-handle", "Boekingen, gastenboek & steunpagina", "Basis analytics"] },
  { id: "tier_pro", label: "Pro", audience: "Bedrijven, KMO’s & events", monthlyCents: 799, storageMb: 51200, oidcApps: 10, qrCodes: null,
    features: ["Eigen domein", "Private e-mailrelay", "Credentials API & uitgebreide ZK-retentie"] },
  { id: "tier_max", label: "Max", audience: "Agencies, studio’s & teams", monthlyCents: 1999, storageMb: 256000, oidcApps: null, qrCodes: null,
    features: ["Geavanceerd teambeheer", "100% white-label", "Priority Architecture Support"] },
];
export function recommendedWorkspacePlan(category: string | null): WorkspacePlanId {
  if (category === "agency") return "tier_max";
  if (category === "project" || category === "nonprofit") return "tier_core";
  return "tier_pro";
}
export function recommendationLabel(id: WorkspacePlanId) {
  return id === "tier_max" ? "Voor professionele schaal" : id === "tier_core" ? "Perfect voor creators" : "Meest gekozen voor bedrijven";
}
export function planAmountCents(plan: WorkspacePricingPlan, cycle: BillingCycle) {
  return plan.monthlyCents * (cycle === "yearly" ? 10 : 1);
}
export const formatPlanPrice = (cents: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export const quotaLabel = (value: number | null) => value === null ? "Onbeperkt" : String(value);
export function pricingSelection(plan_id: WorkspacePlanId, billing_cycle: BillingCycle) {
  return workspaceBillingSchema.parse({ plan_id, billing_cycle });
}