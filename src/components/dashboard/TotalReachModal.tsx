import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { accountReach, formatReach, relativeTimeNl, type ReachSettings } from "@/lib/total-reach";
import { integrationById } from "@/lib/integrations-catalog";
import {
  getReachSettings,
  syncFollowersNow,
  updateReachSettings,
} from "@/lib/total-reach.functions";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Studio-modal "Totaal bereik / volgers tonen": aan/uit, per platform
 * mee-tellen, handmatige override en handmatige sync.
 */
export function TotalReachModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [settings, setSettings] = useState<ReachSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    getReachSettings()
      .then((data) => {
        if (!active) return;
        setSettings(data);
        setDrafts(Object.fromEntries(data.accounts.map((a) => [a.provider, a.manualCount === null ? "" : String(a.manualCount)])));
      })
      .catch(() => toast.error(trI18n.t("ui.adcae84eb2")))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  async function persist(patch: { showTotalReach?: boolean; accounts?: { provider: string; includeInReach?: boolean; manualCount?: number | null }[] }) {
    setBusy(true);
    try {
      const next = await updateReachSettings({ data: patch });
      setSettings(next);
      return next;
    } catch {
      toast.error(trI18n.t("ui.f678834f2b"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveManual(provider: string) {
    const raw = (drafts[provider] ?? "").trim();
    const manualCount = raw === "" ? null : Math.max(0, Number.parseInt(raw, 10) || 0);
    const current = settings?.accounts.find((a) => a.provider === provider)?.manualCount ?? null;
    if (manualCount === current) return;
    if (await persist({ accounts: [{ provider, manualCount }] })) toast.success(trI18n.t("ui.b1bbb502d7"));
  }

  async function handleSync() {
    setBusy(true);
    try {
      const next = await syncFollowersNow();
      setSettings(next);
      toast.success(trI18n.t("ui.50b17fc5ee"));
    } catch {
      toast.error(trI18n.t("ui.94524eb424"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Totaal bereik / volgers tonen</DialogTitle>
          <DialogDescription>
            Toon één compacte badge met je totale bereik over al je sociale accounts. Telt enkel je koppelingen uit Verbindingen &amp; Integraties. Bluesky, wsocial.eu,
            GitHub en YouTube worden automatisch opgehaald; andere platformen vul je zelf in.
          </DialogDescription>
        </DialogHeader>

        {loading || !settings ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-medium">Toon totaal bereik op mijn profiel</p>
                <p className="text-xs text-muted-foreground">
                  Huidig totaal: <strong>{formatReach(settings.totalReachCount)}</strong>
                </p>
              </div>
              <Switch
                checked={settings.showTotalReach}
                disabled={busy}
                onCheckedChange={(checked) => void persist({ showTotalReach: checked })}
                aria-label="Toon totaal bereik op mijn profiel"
              />
            </div>

            <div className="space-y-2">
              <p className="px-1 text-sm font-medium">Meegerekende accounts</p>
              {settings.accounts.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  Nog geen koppelingen. Voeg eerst accounts toe in Verbindingen &amp; Integraties.
                </p>
              ) : (
                <ul className="space-y-2">
                  {settings.accounts.map((account) => {
                    const label = integrationById(account.provider)?.label ?? account.provider;
                    return (
                      <li key={account.provider} className="space-y-2 rounded-xl border border-border bg-card px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {label} <span className="text-muted-foreground">@{account.handle.replace(/^@/, "")}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatReach(accountReach(account))} volgers ·{" "}
                              {account.manualCount !== null
                                ? "handmatig"
                                : account.auto
                                  ? `automatisch · ${relativeTimeNl(account.lastSyncedAt)}`
                                  : "vul handmatig in"}
                            </p>
                          </div>
                          <Switch
                            checked={account.includeInReach}
                            disabled={busy}
                            onCheckedChange={(checked) => void persist({ accounts: [{ provider: account.provider, includeInReach: checked }] })}
                            aria-label={`${label} meetellen`}
                          />
                        </div>
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="h-8 text-xs"
                          aria-label={`Handmatig aantal volgers voor ${label}`}
                          value={drafts[account.provider] ?? ""}
                          disabled={busy}
                          onChange={(e) => setDrafts((d) => ({ ...d, [account.provider]: e.target.value }))}
                          onBlur={() => void saveManual(account.provider)}
                          placeholder={account.auto ? "Handmatig aantal (optioneel, overschrijft automatisch)" : "Handmatig aantal volgers"}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">
                Laatst bijgewerkt: {relativeTimeNl(settings.lastSyncedAt)}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSync()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                )}
                Nu synchroniseren
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Knop + modal in één, klaar om in de Studio te plaatsen. */
export function TotalReachButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Users className="mr-2 h-4 w-4" aria-hidden /> Totaal bereik / volgers tonen
      </Button>
      <TotalReachModal open={open} onOpenChange={setOpen} />
    </>
  );
}
