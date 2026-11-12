import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Building2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PricingTable } from "@/components/workspace/PricingTable";
import { DocHelpLink } from "@/components/seo/DocHelpLink";
import {
  confirmWorkspaceConversionCode,
  getConversionPreflight,
  startWorkspaceConversion,
} from "@/lib/workspace-conversion.functions";
import { CATEGORY_LABELS, INVITE_ROLES, WORKSPACE_CATEGORIES, emptyDraft, stepError, type InviteRole, type WizardDraft } from "@/lib/workspace-wizard";
import { isValidWorkspaceSlug, parseInviteTarget } from "@/lib/workspace-rules";
import { WORKSPACE_PRICING, formatPlanPrice, planAmountCents } from "@/lib/workspace-pricing";

const ERRORS: Record<string, string> = {
  same_account: "De eigenaar moet een ander, persoonlijk account zijn.",
  unknown_user: "Geen ROUT-account gevonden met deze gebruikersnaam.",
  bad_code: "De code klopt niet of is verlopen.",
  rate_limited: "Te veel aanvragen. Probeer het later opnieuw.",
  no_email: "Dit account heeft geen e-mailadres voor de code.",
  no_transfer: "Er loopt geen omzetting meer. Begin opnieuw.",
  too_many_attempts: "Je hebt vandaag al te vaak een omzetting gestart. Probeer het morgen opnieuw.",
};

const STEPS = ["Overzicht", "Organisatie", "Eigenaar & team", "Plan", "Bevestigen"] as const;
const ROLE_LABEL: Record<InviteRole, string> = { admin: "Admin", developer: "Developer", editor: "Editor", viewer: "Viewer" };
const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";

/** Settings: turn this account into a Workspace owned by a human account, with the same questions as a new workspace. */
export function ConvertToWorkspaceWizard() {
  const qc = useQueryClient();
  const preflightFn = useServerFn(getConversionPreflight);
  const startFn = useServerFn(startWorkspaceConversion);
  const confirmFn = useServerFn(confirmWorkspaceConversionCode);
  const { data, isLoading } = useQuery({ queryKey: ["workspace-conversion"], queryFn: () => preflightFn() });
  const [step, setStep] = useState<number | null>(null);
  const [d, setD] = useState<WizardDraft>(emptyDraft);
  const [owner, setOwner] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [inviteTarget, setInviteTarget] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("admin");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace-conversion"] });

  const s = data?.summary;
  const pending = data?.open;
  const plan = WORKSPACE_PRICING.find((p) => p.id === d.plan_id) ?? WORKSPACE_PRICING[0]!;

  const stepProblem = (i: number): string | null => {
    if (i === 1) {
      const chosen = slug ?? s?.suggestedSlug ?? "";
      if (chosen && !isValidWorkspaceSlug(chosen)) return "Adres: minstens 3 tekens, alleen kleine letters, cijfers en koppeltekens.";
      return stepError("identity", d) ?? stepError("category", d);
    }
    if (i === 2) return parseInviteTarget(owner) ? stepError("team", d) : "Vul het e-mailadres of de @gebruikersnaam van de eigenaar in.";
    if (i === 3) return stepError("plan", d);
    return null;
  };

  const next = () => {
    if (step === null) return;
    const problem = stepProblem(step);
    if (problem) return void toast.error(problem);
    setStep(step + 1);
  };

  const addInvite = () => {
    const target = inviteTarget.trim().toLowerCase();
    if (!target) return;
    const nextDraft = { ...d, invites: [...d.invites, { target, role: inviteRole }] };
    const e = stepError("team", nextDraft);
    if (e) return void toast.error(e);
    setD(nextDraft);
    setInviteTarget("");
  };

  async function start() {
    for (const i of [1, 2, 3]) {
      const problem = stepProblem(i);
      if (problem) { setStep(i); return void toast.error(problem); }
    }
    setBusy(true);
    try {
      const r = await startFn({ data: {
        workspaceName: d.name.trim(),
        target: owner.trim(),
        details: { description: d.description.trim(), category: d.category, invites: d.invites, plan_id: d.plan_id, billing_cycle: d.billing_cycle, slug: (slug ?? s?.suggestedSlug ?? "") || null },
      } });
      if (!r.ok) return void toast.error(ERRORS[r.reason] ?? "Dat lukte niet.");
      toast.success(`Code verstuurd naar ${r.sentTo}. Na je bevestiging krijgt de eigenaar een uitnodiging.`);
      setStep(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const r = await confirmFn({ data: { code } });
      if (!r.ok) return void toast.error(ERRORS[r.reason] ?? "Dat lukte niet.");
      toast.success(r.completed ? "Omgezet naar een Workspace. Je kunt dit account nog 30 dagen gebruiken." : "Bevestigd. De eigenaar heeft nu een uitnodiging gekregen.");
      if (r.completed) window.location.reload();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Building2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-medium">Zet dit account om naar een Workspace</h2>
          <p className="text-sm text-muted-foreground">
            Voor accounts die eigenlijk een bedrijf of team zijn. Een persoon wordt eigenaar; dit account blijft nog 30 dagen werken.
          </p>
        </div>
      </div>

      {isLoading || !s ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : pending ? (
        <div className="space-y-3">
          <p className="text-sm">
            Omzetting naar <strong>{pending.workspaceName}</strong>, eigenaar <strong>{pending.targetEmail}</strong>.
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>{pending.otpVerified ? "✓" : "○"} Bevestigd met e-mailcode</li>
            <li>{pending.accepted ? "✓" : "○"} Eigenaar heeft geaccepteerd</li>
          </ul>
          {!pending.otpVerified && (
            <div className="flex gap-2">
              <Input inputMode="numeric" maxLength={6} placeholder="6-cijferige code" value={code} onChange={(e) => setCode(e.target.value)} />
              <Button onClick={confirm} disabled={busy || code.length !== 6}>Bevestig</Button>
            </div>
          )}
        </div>
      ) : step === null ? (
        <Button variant="outline" onClick={() => setStep(0)}>Bekijk wat er meegaat</Button>
      ) : (
        <div className="space-y-5">
          <ol className="grid grid-cols-5 gap-1.5" aria-label="Stappen">
            {STEPS.map((t, i) => (
              <li key={t}>
                <button type="button" disabled={i > step} onClick={() => i < step && setStep(i)} aria-current={i === step ? "step" : undefined} className="w-full text-left">
                  <span className={`block h-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
                  <span className={`mt-1.5 hidden text-xs sm:block ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{t}</span>
                </button>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["Links", s.links],
                  ["QR-codes", s.qrCodes],
                  ["Domeinen", s.domains],
                  ["Apps & API-sleutels", s.apps],
                  ["Badges", s.badges],
                  ["Actieve facturatie", s.activeBilling ? "Ja" : "Nee"],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-medium">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Je profiel, ontwerp, statistieken en domeinen gaan mee. {s.designs > 1 ? "Het ontwerp van je geverifieerde profiel wordt de workspacepagina; je andere ontwerp blijft bewaard als concept. " : ""} {s.hasBlueBadge && "De blauwe verificatiebadge vervalt: die is alleen voor personen. "}
                Facturatie loopt door. Dit account werkt daarna nog 30 dagen gewoon verder als admin van de workspace; pas daarna verdwijnt de login.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Input aria-label="Naam van de organisatie" placeholder="Naam van de organisatie" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={80} />
              <div className="space-y-1.5">
                <label htmlFor="convert-slug" className="text-sm font-medium">Nieuw adres</label>
                <div className="flex min-w-0 items-center rounded-md border border-input bg-background pl-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">rout.be/w/</span>
                  <input id="convert-slug" className="h-10 min-w-0 flex-1 bg-transparent pr-3 outline-none" value={slug ?? s.suggestedSlug} maxLength={40}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Je oude adres blijft 30 dagen werken en stuurt door naar dit adres. Is het al bezet, dan voegen we een paar tekens toe.
                  {s.verifiedDomain && <> Je geverifieerde domein <strong>{s.verifiedDomain}</strong> gaat mee en toont de workspacepagina rechtstreeks.</>}
                </p>
              </div>
              <Textarea aria-label="Omschrijving" placeholder="Wat doet jullie organisatie? (optioneel)" rows={3} maxLength={280} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
              <p className="text-sm font-medium">Wat voor organisatie is het?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {WORKSPACE_CATEGORIES.map((c) => (
                  <Button key={c} type="button" variant={d.category === c ? "default" : "outline"} aria-pressed={d.category === c} onClick={() => setD({ ...d, category: c })} className="justify-start">
                    {CATEGORY_LABELS[c]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Eigenaar</p>
                <Input aria-label="E-mail of @gebruikersnaam van de eigenaar" placeholder="naam@bedrijf.be of @gebruikersnaam" value={owner} onChange={(e) => setOwner(e.target.value)} />
                <p className="text-xs text-muted-foreground">Een ander, persoonlijk ROUT-account. Die persoon moet de omzetting accepteren.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Collega’s uitnodigen (optioneel)</p>
                <div className="flex flex-wrap gap-2">
                  <Input aria-label="E-mail of @gebruikersnaam" placeholder="naam@bedrijf.be of @gebruikersnaam" value={inviteTarget} onChange={(e) => setInviteTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInvite())} className="min-w-[14rem] flex-1" />
                  <select aria-label="Rol" className={selectClass} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as InviteRole)}>
                    {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <Button type="button" variant="outline" onClick={addInvite} className="gap-1.5"><Plus className="h-4 w-4" /> Toevoegen</Button>
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {d.invites.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nog niemand uitgenodigd.</li>}
                  {d.invites.map((i, idx) => (
                    <li key={i.target} className="flex items-center gap-2 p-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{i.target}</span>
                      <span className="text-xs text-muted-foreground">{ROLE_LABEL[i.role]}</span>
                      <button type="button" aria-label={`${i.target} verwijderen`} onClick={() => setD({ ...d, invites: d.invites.filter((_, j) => j !== idx) })} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <DocHelpLink to="/support/workspace/team-roles">Bekijk het overzicht van alle teamrollen en rechten</DocHelpLink>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <PricingTable category={d.category} planId={d.plan_id} billingCycle={d.billing_cycle} onPlanChange={(plan_id) => setD((p) => ({ ...p, plan_id }))} onCycleChange={(billing_cycle) => setD((p) => ({ ...p, billing_cycle }))} />
              <p className="text-xs text-muted-foreground">Je keuze wordt bewaard als voorkeur. Betaalde limieten starten pas na een bevestigde betaling.</p>
            </div>
          )}

          {step === 4 && (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">Organisatie</dt><dd className="font-medium">{d.name}{d.category ? ` · ${CATEGORY_LABELS[d.category]}` : ""}</dd></div>
              <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">Nieuw adres</dt><dd className="break-all font-medium">rout.be/w/{slug ?? s.suggestedSlug}</dd></div>
              <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">Eigenaar</dt><dd className="font-medium">{owner}</dd></div>
              <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">Uitnodigingen</dt><dd className="font-medium">{d.invites.length}</dd></div>
              <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">Plan</dt><dd className="font-medium">{plan.label} · {formatPlanPrice(planAmountCents(plan, d.billing_cycle))} {d.billing_cycle === "yearly" ? "per jaar" : "per maand"}</dd></div>
            </dl>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(step === 0 ? null : step - 1)} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> {step === 0 ? "Annuleren" : "Terug"}</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} className="gap-1.5">Volgende <ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={start} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Stuur bevestigingscode</Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
