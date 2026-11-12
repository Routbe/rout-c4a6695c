/**
 * Admin panel: platform-wide signup-block counts. Addresses are encrypted and
 * visible only to each profile owner in their Studio, never here.
 */
import { useCallback, useEffect, useState } from "react";
import { Lock, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminNewsletterOverview } from "@/lib/admin-newsletter.functions";

type Overview = Awaited<ReturnType<typeof adminNewsletterOverview>>;

const LABELS: Array<[keyof Overview["counts"], string]> = [
  ["total", "Totaal"],
  ["confirmed", "Bevestigd"],
  ["pending", "Wacht op bevestiging"],
  ["unsubscribed", "Afgemeld"],
  ["synced", "Naar Brevo"],
  ["failed", "Brevo mislukt"],
];

export function NewsletterSyncPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await adminNewsletterOverview());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Laden mislukt.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Mail className="h-4 w-4" aria-hidden /> Inschrijfblokken
        </h2>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Vernieuwen
        </Button>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        E-mailadressen zijn versleuteld en alleen zichtbaar voor de eigenaar van het profiel, via de Studio. Dit overzicht toont enkel aantallen.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LABELS.map(([key, label]) => (
          <div key={key} className="rounded-xl border border-border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{data ? data.counts[key] : "–"}</p>
          </div>
        ))}
      </div>
      {data && !data.brevoConfigured && (
        <p className="text-xs text-muted-foreground">Brevo is niet ingesteld; bevestigde inschrijvingen blijven alleen in ROUT.</p>
      )}
    </section>
  );
}
