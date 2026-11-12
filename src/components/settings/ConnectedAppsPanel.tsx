import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, AppWindow, BellRing, Check, Clock, Loader2, MailCheck, Minus } from "lucide-react";
import { toast } from "sonner";
import { withStepUp } from "@/components/auth/StepUpDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listAppEmails,
  listConnectedApps,
  pushAppEmail,
  revokeConnectedApp,
  setAppEmail,
  type AppEmailPushResult,
} from "@/lib/oauth/connected-apps.functions";
import { PUSH_OUTCOME_LABEL, type PushOutcome } from "@/lib/oauth/email-push";
import { i18n as trI18n } from "@/lib/i18n";

const SOURCE_LABEL = { primary: "Primair", alias: "Contact-alias", relay: "Privé-relay" } as const;

const OUTCOME_ICON: Record<PushOutcome, typeof Check> = {
  notified: BellRing,
  next_login: Clock,
  delivery_failed: AlertTriangle,
  unchanged: Check,
  unavailable: Minus,
  no_consent: Minus,
};

/** "Gekoppelde Apps & E-mail Beheer": apps via "Login met ROUT", per-app email and revoke. */
export function ConnectedAppsPanel({ autoWizard = true }: { autoWizard?: boolean } = {}) {
  const list = useServerFn(listConnectedApps);
  const emails = useServerFn(listAppEmails);
  const revoke = useServerFn(revokeConnectedApp);
  const setEmail = useServerFn(setAppEmail);
  const push = useServerFn(pushAppEmail);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [choiceId, setChoiceId] = useState("primary");
  const [results, setResults] = useState<AppEmailPushResult[] | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["connected-apps"], queryFn: () => list() });
  const mail = useQuery({ queryKey: ["connected-app-emails"], queryFn: () => emails() });
  const stale = mail.data?.stale ?? [];

  // Primary address changed since these apps got theirs: open the wizard once.
  useEffect(() => {
    if (autoWizard && stale.length) {
      setPicked(stale);
      setChoiceId("primary");
      setResults(null);
      setWizard(true);
    }
  }, [stale.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["connected-apps"] }),
    qc.invalidateQueries({ queryKey: ["connected-app-emails"] }),
  ]);

  async function onRevoke(clientId: string, name: string) {
    setBusy(clientId);
    try {
      await withStepUp(() => revoke({ data: { clientId } }));
      toast.success(`Toegang voor ${name} is ingetrokken.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Intrekken mislukt.");
    } finally {
      setBusy(null);
    }
  }

  async function onChoose(clientId: string, choiceId: string) {
    setBusy(clientId);
    try {
      await withStepUp(() => setEmail({ data: { clientId, choiceId } }));
      toast.success(trI18n.t("ui.88b8cf2e50"));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBusy(null);
    }
  }

  async function onPush() {
    setBusy("bulk");
    try {
      const r = await withStepUp(() => push({ data: { choiceId, clientIds: picked } }));
      setResults(r.results);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Doorgeven mislukt.");
    } finally {
      setBusy(null);
    }
  }

  const apps = data ?? [];
  // Only apps that may see your e-mail can receive a change.
  const emailApps = apps.filter((a) => mail.data?.apps.some((m) => m.clientId === a.clientId));
  const allPicked = emailApps.length > 0 && emailApps.every((a) => picked.includes(a.clientId));
  // Same addresses for every app (primary, aliases); the relay is unique per app.
  const choices = (() => {
    const seen = new Map<string, string>();
    for (const m of mail.data?.apps ?? []) {
      for (const o of m.options) {
        if (seen.has(o.id)) continue;
        seen.set(o.id, o.source === "relay" ? "Privé-relay · een eigen adres per app" : `${SOURCE_LABEL[o.source]} · ${o.email}`);
      }
    }
    return [...seen].map(([id, label]) => ({ id, label }));
  })();
  const nameOf = (clientId: string) => apps.find((a) => a.clientId === clientId)?.name ?? clientId;
  const openWizard = () => {
    setPicked(emailApps.map((a) => a.clientId));
    setChoiceId("primary");
    setResults(null);
    setWizard(true);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <AppWindow className="h-4 w-4" /> Gekoppelde Apps &amp; E-mail Beheer
        </h2>
        {apps.length > 0 && (
          <Button variant="outline" size="sm" onClick={openWizard} disabled={!emailApps.length}>
            <MailCheck className="h-4 w-4" /> E-mailwijziging doorgeven
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Apps waarbij je inlogde met ROUT. Kies per app welk e-mailadres ze zien. Intrekken logt de app direct uit.
      </p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !apps.length ? (
        <p className="text-sm text-muted-foreground">Nog geen verbonden apps.</p>
      ) : (
        <ul className="divide-y divide-border">
          {apps.map((app) => {
            const em = mail.data?.apps.find((a) => a.clientId === app.clientId);
            return (
              <li key={app.clientId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{app.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Sinds {new Date(app.grantedAt).toLocaleDateString("nl-BE")}
                    {em?.assignedEmail ? ` · ${em.assignedEmail}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {app.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs font-normal">{s}</Badge>
                    ))}
                  </div>
                  {em && em.options.length > 1 && (
                    <div className="mt-2 max-w-xs">
                      <Select value={em.choiceId} onValueChange={(v) => void onChoose(app.clientId, v)} disabled={busy === app.clientId}>
                        <SelectTrigger className="h-9 text-xs" aria-label={`E-mailadres voor ${app.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {em.options.map((o) => (
                            <SelectItem key={o.id} value={o.id} className="text-xs">
                              {SOURCE_LABEL[o.source]} · {o.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" disabled={busy === app.clientId}
                  onClick={() => void onRevoke(app.clientId, app.name)}>
                  {busy === app.clientId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Toegang intrekken"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={wizard} onOpenChange={setWizard}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {results ? (
            <>
              <DialogHeader>
                <DialogTitle>Zo ging het per app</DialogTitle>
                <DialogDescription>
                  {results.filter((r) => r.outcome === "notified").length} app(s) zijn direct op de hoogte gebracht.
                  De andere lezen je adres bij de volgende login.
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-2" aria-live="polite">
                {results.map((r) => {
                  const Icon = OUTCOME_ICON[r.outcome];
                  return (
                    <li key={r.clientId} className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${r.outcome === "delivery_failed" ? "text-destructive" : "text-muted-foreground"}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{nameOf(r.clientId)}</p>
                        <p className="text-xs text-muted-foreground">
                          {PUSH_OUTCOME_LABEL[r.outcome]}
                          {r.email ? ` · ${r.email}` : ""}
                        </p>
                      </div>
                      {r.outcome === "notified" && <Badge className="shrink-0 text-xs">Gemeld</Badge>}
                    </li>
                  );
                })}
              </ul>
              <DialogFooter>
                <Button onClick={() => setWizard(false)}>Klaar</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>E-mailwijziging doorgeven aan je apps</DialogTitle>
                <DialogDescription>
                  Kies welk adres je apps voortaan krijgen en welke apps het moeten weten.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-sm font-medium">Nieuw adres voor deze apps</p>
                <Select value={choiceId} onValueChange={setChoiceId}>
                  <SelectTrigger className="h-10 text-sm" aria-label="Adres dat de apps krijgen">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Een helemaal nieuw adres? Wijzig eerst je primaire e-mailadres op deze pagina. Na de bevestiging kies je hier welke apps het krijgen.
                </p>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-sm font-medium">
                <Checkbox checked={allPicked} onCheckedChange={(v) => setPicked(v ? emailApps.map((a) => a.clientId) : [])} />
                Wijziging doorgeven aan alle apps
              </label>
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {apps.map((a) => {
                  const canSee = emailApps.some((e) => e.clientId === a.clientId);
                  return (
                    <li key={a.clientId}>
                      <label className={`flex items-center gap-3 text-sm ${canSee ? "" : "opacity-60"}`}>
                        <Checkbox
                          disabled={!canSee}
                          checked={canSee && picked.includes(a.clientId)}
                          onCheckedChange={(v) => setPicked((p) => (v ? [...p, a.clientId] : p.filter((x) => x !== a.clientId)))}
                        />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                        {!canSee && <span className="text-xs text-muted-foreground">ziet je e-mail niet</span>}
                        {stale.includes(a.clientId) && <Badge variant="secondary" className="text-xs">oud adres</Badge>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <DialogFooter>
                <Button variant="outline" onClick={() => setWizard(false)}>Later</Button>
                <Button onClick={() => void onPush()} disabled={!picked.length || busy === "bulk"}>
                  {busy === "bulk" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Doorgeven (${picked.length})`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
