import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Fingerprint, Loader2, Mail, Send, ShieldCheck, Webhook } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { SovereignTrustWidget } from "@/components/dashboard/SovereignTrustWidget";
import { ConnectedAppsPanel } from "@/components/settings/ConnectedAppsPanel";
import { withStepUp } from "@/components/auth/StepUpDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useRelayStore } from "@/lib/local-first/useRelayStore";
import { startPrimaryEmailChange } from "@/lib/auth/email-safety.functions";
import { bulkUpdateAppEmails, listAppEmails, listConnectedApps, setAppEmail } from "@/lib/oauth/connected-apps.functions";
import { isPushable, pushableIds, toggleAll, togglePick } from "@/lib/identity-push";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * /dashboard/identity — Identity Relays & Connected Apps.
 * 1. Identity Relays (primary model): each app only sees a ROUT proxy address
 *    that forwards to the member's real address; a primary change never has to
 *    be pushed. Pause/resume is local-first (0 ms UI, background sync).
 * 2. Change the primary address (verified by mail, step-up protected).
 * 3. Fallback for apps that still know the real address: the ROUT Push Protocol
 *    (signed `email.updated` webhook per selected app).
 */
export function IdentityHub() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const relayStore = useRelayStore(user?.id ?? null);
  const enableRelay = useServerFn(setAppEmail);
  const [enabling, setEnabling] = useState<string | null>(null);
  const listApps = useServerFn(listConnectedApps);
  const listEmails = useServerFn(listAppEmails);
  const startChange = useServerFn(startPrimaryEmailChange);
  const push = useServerFn(bulkUpdateAppEmails);
  const apps = useQuery({ queryKey: ["connected-apps"], queryFn: () => listApps() });
  const mail = useQuery({ queryKey: ["connected-app-emails"], queryFn: () => listEmails() });
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<"email" | "push" | null>(null);

  const rows = (apps.data ?? []).map((a) => {
    const em = mail.data?.apps.find((m) => m.clientId === a.clientId);
    return { ...a, choiceId: em?.choiceId ?? "primary", assignedEmail: em?.assignedEmail ?? null };
  });
  const stale = mail.data?.stale ?? [];
  const selectable = pushableIds(rows);
  const allPicked = selectable.length > 0 && selectable.every((id) => picked.includes(id));

  const relays = relayStore.relays ?? [];
  const relayApps = new Set(relays.map((r) => r.appId));
  const withoutRelay = (apps.data ?? []).filter((a) => !relayApps.has(a.clientId));
  const relayOffered = (clientId: string) =>
    Boolean(mail.data?.apps.find((m) => m.clientId === clientId)?.options.some((o) => o.source === "relay"));

  async function onEnableRelay(clientId: string, name: string) {
    setEnabling(clientId);
    try {
      await withStepUp(() => enableRelay({ data: { clientId, choiceId: "relay" } }));
      toast.success(`${name} ziet voortaan alleen je ROUT-alias.`);
      await Promise.all([
        relayStore.refresh(),
        qc.invalidateQueries({ queryKey: ["connected-apps"] }),
        qc.invalidateQueries({ queryKey: ["connected-app-emails"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Relay inschakelen mislukt.");
    } finally {
      setEnabling(null);
    }
  }

  async function onChangeEmail() {
    setBusy("email");
    try {
      await withStepUp(() => startChange({ data: { email } }));
      toast.success(trI18n.t("ui.6f4a8a3c8b"));
      setEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wijziging geblokkeerd.");
    } finally {
      setBusy(null);
    }
  }

  async function onPush() {
    setBusy("push");
    try {
      const r = await withStepUp(() => push({ data: { clientIds: picked } }));
      toast.success(r.updated ? `${r.updated} app(s) ontvangen ${mail.data?.primary ?? "je adres"}.` : "Alle gekozen apps waren al up-to-date.");
      setPicked([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["connected-apps"] }),
        qc.invalidateQueries({ queryKey: ["connected-app-emails"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Push mislukt.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppLayout
      title="Identity & Connected Apps"
      description="Eén identiteit, jouw regels: beheer wie je e-mailadres krijgt."
      crumbs={[{ label: "Command Center", to: "/dashboard" }, { label: "Identity" }]}
    >
      <div className="space-y-4">
        <SovereignTrustWidget />
        <section data-tour="identity-relays" className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Fingerprint className="h-4 w-4" /> Identity Relays
            </h2>
            {relayStore.pending > 0 ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> synchroniseren…
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Een gekoppelde app ziet enkel een anoniem ROUT-alias. Mail naar dat alias komt bij je échte adres
            ({mail.data?.primary ?? "—"}) aan. Wijzig je je adres, dan volgt elke relay automatisch — er hoeft niets naar de app
            gepusht te worden. Pauzeren houdt alle mail van die app tegen.
          </p>

          {relayStore.relays === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : relays.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {relays.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.appName}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs text-muted-foreground">{r.proxyEmail}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label={`Alias van ${r.appName} kopiëren`}
                        onClick={() => {
                          void navigator.clipboard.writeText(r.proxyEmail);
                          toast.success(trI18n.t("ui.23ac7226b8"));
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">→ {r.targetEmail}</span>
                  </span>
                  <Badge variant={r.status === "active" ? "secondary" : "outline"} className="text-xs font-normal">
                    {r.status === "active" ? "actief" : "gepauzeerd"}
                  </Badge>
                  <Switch
                    checked={r.status === "active"}
                    onCheckedChange={() => void relayStore.toggle(r)}
                    aria-label={`Relay voor ${r.appName} ${r.status === "active" ? "pauzeren" : "hervatten"}`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">Nog geen relays actief.</p>
          )}

          {withoutRelay.length ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Apps met je echte adres</p>
              <ul className="space-y-2">
                {withoutRelay.map((a) => (
                  <li key={a.clientId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                    <span className="min-w-0 truncate text-sm font-medium">{a.name}</span>
                    {relayOffered(a.clientId) ? (
                      <Button size="sm" variant="outline" disabled={enabling === a.clientId} onClick={() => void onEnableRelay(a.clientId, a.name)}>
                        {enabling === a.clientId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Privé-relay inschakelen"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Relay-engine niet beschikbaar voor deze app</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section data-tour="identity-email" className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Mail className="h-4 w-4" /> Primair e-mailadres
          </h2>
          <p className="text-sm text-muted-foreground">
            Huidig: <span className="font-medium text-foreground">{mail.data?.primary ?? "—"}</span>. Je nieuwe adres wordt pas actief na
            bevestiging; je oude adres blijft 48 uur beschikbaar voor noodherstel.
          </p>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void onChangeEmail();
            }}
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nieuw@adres.be"
              autoComplete="email"
              aria-label="Nieuw primair e-mailadres"
              className="h-11 rounded-xl"
            />
            <Button type="submit" className="h-11 shrink-0" disabled={!email || busy === "email"}>
              {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adres wijzigen"}
            </Button>
          </form>
        </section>

        <section data-tour="identity-push" className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Webhook className="h-4 w-4" /> ROUT Push Protocol <Badge variant="outline" className="text-xs font-normal">fallback</Badge>
            </h2>
            {selectable.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setPicked(toggleAll(rows, picked))}>
                {allPicked ? "Deselecteer alles" : "Selecteer alles"}
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Alleen voor apps die je echte adres nog kennen. Kies welke gekoppelde apps je primaire adres ({mail.data?.primary ?? "—"}) krijgen. Elke app ontvangt een ondertekende
            <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">email.updated</code>webhook. Apps met een privé-relay
            houden hun relay-adres.
          </p>

          {apps.isLoading || mail.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !rows.length ? (
            <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
              Nog geen apps gekoppeld via “Login met ROUT”.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((app) => {
                const disabled = !isPushable(app);
                return (
                  <li key={app.clientId}>
                    <label className={`flex items-center gap-3 p-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
                      <Checkbox
                        checked={picked.includes(app.clientId)}
                        disabled={disabled}
                        onCheckedChange={() => setPicked((p) => togglePick(rows, p, app.clientId))}
                        aria-label={`Push naar ${app.name}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{app.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{app.assignedEmail ?? "Nog geen adres gedeeld"}</span>
                      </span>
                      {disabled ? (
                        <Badge variant="outline" className="text-xs font-normal">privé-relay</Badge>
                      ) : stale.includes(app.clientId) ? (
                        <Badge variant="secondary" className="text-xs">oud adres</Badge>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-end">
            <Button onClick={() => void onPush()} disabled={!picked.length || busy === "push"} className="gap-2">
              {busy === "push" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Push naar {picked.length} app{picked.length === 1 ? "" : "s"}
            </Button>
          </div>
        </section>

        <ConnectedAppsPanel autoWizard={false} />
      </div>
    </AppLayout>
  );
}
