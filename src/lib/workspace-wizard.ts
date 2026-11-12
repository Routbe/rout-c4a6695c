/** Pure rules for the 5-step "new workspace" wizard. Shared by the UI and createWorkspace (server). */
import { isValidWorkspaceSlug, parseInviteTarget, slugify } from "./workspace-rules";
import { WORKSPACE_PRICING, workspaceBillingSchema, type WorkspacePlanId, type BillingCycle } from "./workspace-pricing";

export const WIZARD_STEPS = ["identity", "address", "category", "team", "plan"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WORKSPACE_CATEGORIES = ["business", "agency", "nonprofit", "event", "project"] as const;
export type WorkspaceCategory = (typeof WORKSPACE_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<WorkspaceCategory, string> = {
  business: "Bedrijf / KMO",
  agency: "Agency / Studio",
  nonprofit: "Non-profit",
  event: "Event",
  project: "Project",
};

export const INVITE_ROLES = ["admin", "developer", "editor", "viewer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
export const MAX_WIZARD_INVITES = 20;

export type WizardDraft = {
  name: string;
  description: string;
  avatarUrl: string | null;
  icon: string | null;
  slugBase: string;
  category: WorkspaceCategory | null;
  /** `target` is an e-mail address or a ROUT @username. */
  invites: { target: string; role: InviteRole }[];
  plan_id: WorkspacePlanId;
  billing_cycle: BillingCycle;
};

export const emptyDraft = (): WizardDraft => ({ name: "", description: "", avatarUrl: null, icon: null, slugBase: "", category: null, invites: [], plan_id: "tier_starter", billing_cycle: "monthly" });

/** Error message for a step, or null when the step is complete. */
export function stepError(step: WizardStep, d: WizardDraft): string | null {
  switch (step) {
    case "identity":
      if (!d.name.trim()) return "Geef je workspace een naam.";
      if (d.name.trim().length > 80) return "De naam mag maximaal 80 tekens zijn.";
      if (d.description.length > 280) return "De omschrijving mag maximaal 280 tekens zijn.";
      return null;
    case "address":
      if (!isValidWorkspaceSlug(`${d.slugBase}-abcd`) || d.slugBase.length < 3) return "Kies een adres van minstens 3 tekens: alleen a-z, 0-9 en koppeltekens.";
      return null;
    case "category":
      return d.category ? null : "Kies een categorie.";
    case "team": {
      if (d.invites.length > MAX_WIZARD_INVITES) return `Maximaal ${MAX_WIZARD_INVITES} uitnodigingen tegelijk.`;
      const seen = new Set<string>();
      for (const i of d.invites) {
        const t = parseInviteTarget(i.target);
        if (!t) return `"${i.target}" is geen geldig e-mailadres of @gebruikersnaam.`;
        const key = `${t.kind}:${t.value}`;
        if (seen.has(key)) return `${i.target.trim()} staat er twee keer in.`;
        if (!(INVITE_ROLES as readonly string[]).includes(i.role)) return "Ongeldige rol.";
        seen.add(key);
      }
      return null;
    }
    case "plan":
      return workspaceBillingSchema.safeParse(d).success ? null : "Kies een geldig plan en een facturatieperiode.";
  }
}

/** Slug base suggested from the name (the 4-char suffix is added by the server). */
export function suggestSlugBase(name: string): string {
  return slugify(name).slice(0, 34).replace(/-+$/, "");
}

/** URL preview: rout.be/w/<base>-<suffix>. */
export function previewUrl(slugBase: string, suffix: string): string {
  return `rout.be/w/${slugBase || "naam"}-${suffix}`;
}

/** Plan comparison shown in step 5. Storage comes from the entitlement engine. */
export const WORKSPACE_PLAN_COMPARISON = WORKSPACE_PRICING.map(p => ({ ...p, tier: p.id, cleanSlug: p.id === "tier_pro" || p.id === "tier_max" }));

export function formatMb(mb: number): string {
  if (mb <= 0) return "0 MB";
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;
}
