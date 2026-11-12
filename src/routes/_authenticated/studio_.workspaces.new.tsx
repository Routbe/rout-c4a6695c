import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Building2, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { checkWorkspaceSlugBase, createWorkspace } from "@/lib/workspaces.functions";
import { getActiveScopeStorage } from "@/lib/assets.functions";
import { scopedPath } from "@/lib/scope-routes";
import { PricingTable } from "@/components/workspace/PricingTable";
import { DocHelpLink } from "@/components/seo/DocHelpLink";
import { WorkspaceIcon } from "@/components/workspace/WorkspaceIcon";
import { WorkspaceIconPicker } from "@/components/workspace/WorkspaceIconPicker";
import { isWorkspaceIconKey } from "@/lib/workspace-icons";
import {
  CATEGORY_LABELS,
  INVITE_ROLES,
  WIZARD_STEPS,
  WORKSPACE_CATEGORIES,
  emptyDraft,
  formatMb,
  previewUrl,
  stepError,
  suggestSlugBase,
  type InviteRole,
  type WizardDraft,
} from "@/lib/workspace-wizard";

export const Route = createFileRoute("/_authenticated/studio_/workspaces/new")({
  head: () => ({
    meta: [
      { title: "Nieuwe workspace — ROUT Studio" },
      { name: "description", content: "Maak in vijf stappen een aparte ROUT-omgeving voor je bedrijf, team of project." },
      { property: "og:title", content: "Nieuwe workspace — ROUT Studio" },
      { property: "og:description", content: "Maak in vijf stappen een aparte ROUT-omgeving voor je bedrijf, team of project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewWorkspaceWizard,
});

const STEP_TITLES = ["Identiteit", "Adres", "Categorie", "Team", "Plan"];
const ROLE_LABEL: Record<InviteRole, string> = { admin: "Admin", developer: "Developer", editor: "Editor", viewer: "Viewer" };
const DRAFT_KEY = "rout:new-workspace-draft";

function NewWorkspaceWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<WizardDraft>(emptyDraft);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("developer");
  const checkSlug = useServerFn(checkWorkspaceSlugBase);
  const create = useServerFn(createWorkspace);
  const storage = useQuery({ queryKey: ["scope-storage"], queryFn: useServerFn(getActiveScopeStorage), retry: false });

  // Draft survives a refresh (this tab only); cleared on completion.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Omit<Partial<WizardDraft>, "invites"> & { invites?: { target?: string; email?: string; role: InviteRole }[] };
        // Older drafts stored invites as { email }; keep them as { target }.
        const invites = (saved.invites ?? []).map((i) => ({ target: i.target ?? i.email ?? "", role: i.role })).filter((i) => i.target);
        setD({ ...emptyDraft(), ...saved, invites });
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }, [d]);

  useEffect(() => {
    if (!slugTouched) setD((p) => ({ ...p, slugBase: suggestSlugBase(p.name) }));
  }, [d.name, slugTouched]);

  const slugQ = useQuery({
    queryKey: ["ws-slug-check", d.slugBase],
    queryFn: () => checkSlug({ data: { base: d.slugBase } }),
    enabled: step === 1 && d.slugBase.length >= 3,
    staleTime: Infinity,
  });

  const current = WIZARD_STEPS[step] ?? "identity";
  const err = stepError(current, d);
  const slugBlocked = current === "address" && (slugQ.isLoading || (slugQ.data && !slugQ.data.ok));

  const addInvite = () => {
    const target = inviteEmail.trim().toLowerCase();
    if (!target) return;
    const next = { ...d, invites: [...d.invites, { target, role: inviteRole }] };
    const e = stepError("team", next);
    if (e) return toast.error(e);
    setD(next);
    setInviteEmail("");
  };

  const finish = async () => {
    for (const s of WIZARD_STEPS) {
      const e = stepError(s, d);
      if (e) { setStep(WIZARD_STEPS.indexOf(s)); return toast.error(e); }
    }
    setBusy(true);
    try {
      const res = await create({ data: {
        name: d.name.trim(), description: d.description.trim() || undefined, slugBase: d.slugBase,
        category: d.category ?? undefined, invites: d.invites,
        icon: isWorkspaceIconKey(d.icon) ? d.icon : null, avatarUrl: d.avatarUrl, suffix: slugQ.data?.ok ? slugQ.data.suffix : undefined,
        plan_id: d.plan_id, billing_cycle: d.billing_cycle,
      } });
      sessionStorage.removeItem(DRAFT_KEY);
      await qc.cancelQueries();
      qc.clear();
      toast.success(res.invited ? `Workspace aangemaakt. ${res.invited} uitnodiging(en) verstuurd.` : "Workspace aangemaakt.");
      void navigate({ to: scopedPath(res.slug, "studio") as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Workspace kon niet worden aangemaakt.");
    } finally {
      setBusy(false);
    }
  };

  const s = storage.data as { usedBytes?: number; quotaBytes?: number; plan?: string } | undefined;

  return (
    <main className={`mx-auto w-full px-4 py-8 sm:py-12 ${current === "plan" ? "max-w-6xl" : "max-w-2xl"}`}>
      <Link to="/studio" search={{ mode: undefined, type: undefined, url: undefined, workspace: undefined }} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Terug naar Studio
      </Link>
      <h1 className="flex items-center gap-2 font-display text-2xl sm:text-3xl"><Building2 className="h-6 w-6" /> Nieuwe workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">Een aparte omgeving met een eigen Profiel Hub, QR-codes, Developer Console en team.</p>

      <ol className="mt-6 grid grid-cols-5 gap-1.5" aria-label="Stappen">
        {STEP_TITLES.map((t, i) => (
          <li key={t}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className="w-full text-left"
              aria-current={i === step ? "step" : undefined}
            >
              <span className={`block h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <span className={`mt-1.5 block truncate text-[11px] sm:text-xs ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {i + 1}. {t}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <section className={`mt-6 space-y-4 ${current === "plan" ? "" : "rounded-lg border border-border bg-card p-4 sm:p-6"}`}>
        {current === "identity" && (
          <>
            <DocHelpLink to="/support/workspace/getting-started/what-is-a-workspace">Nieuw bij Workspaces? Lees hoe bedrijfsaccounts werken.</DocHelpLink>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary" aria-hidden>
                <WorkspaceIcon avatarUrl={d.avatarUrl} icon={d.icon} category={d.category} className={d.avatarUrl ? "h-14 w-14 rounded-xl" : "h-7 w-7"} />
              </div>
              <p className="text-xs text-muted-foreground">Bij de stap Categorie kies je een passend icoon of upload je je eigen logo.</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Naam van de workspace</span>
              <Input value={d.name} maxLength={80} placeholder="Acme Corp" onChange={(e) => setD({ ...d, name: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Korte omschrijving <span className="text-muted-foreground">(optioneel)</span></span>
              <Textarea value={d.description} maxLength={280} rows={3} placeholder="Wat doet je team?" onChange={(e) => setD({ ...d, description: e.target.value })} />
              <span className="block text-right text-xs text-muted-foreground">{d.description.length}/280</span>
            </label>
          </>
        )}

        {current === "address" && (
          <>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Adres</span>
              <Input
                value={d.slugBase}
                maxLength={34}
                onChange={(e) => { setSlugTouched(true); setD({ ...d, slugBase: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }); }}
              />
            </label>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Je publieke pagina</p>
              <p className="mt-0.5 break-all font-mono">{previewUrl(d.slugBase, slugQ.data?.suffix ?? "····")}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs" role="status">
                {slugQ.isLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Controleren…</>
                  : slugQ.data?.ok ? <><Check className="h-3.5 w-3.5 text-primary" /> Beschikbaar</>
                  : slugQ.data ? <span className="text-destructive">{slugQ.data.reason === "taken" ? "Bezet, probeer een ander adres." : "Dit adres is niet toegestaan."}</span>
                  : null}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Gratis workspaces krijgen 4 willekeurige tekens achter hun naam. Met Pro of Max kun je later een schoon adres claimen.</p>
          </>
        )}

        {current === "category" && (
          <>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Categorie">
            {WORKSPACE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={d.category === c}
                onClick={() => setD({ ...d, category: c })}
                className={`rounded-xl border p-3 text-left text-sm transition-colors ${d.category === c ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">Icoon of logo</p>
            <p className="text-xs text-muted-foreground">Het icoon volgt je categorie. Kies gerust een ander of upload je eigen logo.</p>
            <WorkspaceIconPicker value={{ icon: isWorkspaceIconKey(d.icon) ? d.icon : null, avatarUrl: d.avatarUrl }} category={d.category} onChange={(v) => setD((p) => ({ ...p, icon: v.icon, avatarUrl: v.avatarUrl }))} />
          </div>
          </>
        )}

        {current === "team" && (
          <>
            <DocHelpLink to="/support/workspace/getting-started/invite-team">Hoe nodig ik mijn collega’s veilig uit?</DocHelpLink>
            <p className="text-sm text-muted-foreground">Nodig je team uit. Ze krijgen een e-mail en worden lid zodra ze inloggen met dat adres. Je kunt dit ook overslaan.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input aria-label="E-mail of @gebruikersnaam" value={inviteEmail} placeholder="naam@bedrijf.be of @gebruikersnaam" onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInvite())} />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as InviteRole)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" aria-label="Rol">
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
          </>
        )}

        {current === "plan" && (
          <>
            {s?.quotaBytes !== undefined && (
              <p className="text-sm text-muted-foreground">
                Opslag in je huidige omgeving: {formatMb(Math.round((s.usedBytes ?? 0) / 1048576))} van {formatMb(Math.round(s.quotaBytes / 1048576))} gebruikt. De nieuwe workspace krijgt een eigen, aparte opslag.
              </p>
            )}
            <PricingTable category={d.category} planId={d.plan_id} billingCycle={d.billing_cycle} onPlanChange={plan_id => setD(p => ({ ...p, plan_id }))} onCycleChange={billing_cycle => setD(p => ({ ...p, billing_cycle }))} />
          </>
        )}

        {err && current !== "team" && current !== "plan" && (d.name || step > 0) && <p className="text-xs text-destructive">{err}</p>}
      </section>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0 || busy} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Vorige
        </Button>
        {step < WIZARD_STEPS.length - 1 ? (
          <Button type="button" onClick={() => setStep((n) => n + 1)} disabled={Boolean(err) || Boolean(slugBlocked)} className="gap-1.5">
            {current === "team" && d.invites.length === 0 ? "Overslaan" : "Volgende"} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={finish} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Workspace voltooien & openen
          </Button>
        )}
      </div>
    </main>
  );
}
