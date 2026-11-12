import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { listInvoiceDeliveries, retryInvoiceDelivery } from "@/lib/admin-delivery.functions";
import type { DeliveryRow } from "@/lib/admin-delivery.server";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Aflevermonitor: per betaling of de factuur-PDF is aangemaakt en de
 * Brevo-bevestiging is vertrokken, met een directe "Opnieuw versturen".
 */
export function DeliveryMonitorPanel() {
  const list = useServerFn(listInvoiceDeliveries);
  const retry = useServerFn(retryInvoiceDelivery);
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await list({ data: { onlyFailed } })) as DeliveryRow[]);
    } catch {
      toast.error(trI18n.t("ui.d71ea4ca3e"));
    } finally {
      setLoading(false);
    }
  }, [list, onlyFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRetry = async (paymentId: string) => {
    setBusy(paymentId);
    try {
      const result = await retry({ data: { paymentId } });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await load();
    } catch {
      toast.error(trI18n.t("ui.756235bc1b"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Facturen &amp; e-maillevering</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Status van de PDF-factuur en de Brevo-bevestiging per betaling.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="only-failed" checked={onlyFailed} onCheckedChange={setOnlyFailed} />
            <Label htmlFor="only-failed" className="text-xs">
              Alleen problemen
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Vernieuwen
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {loading ? "Laden…" : "Geen leveringen gevonden."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row) => {
            const ok = row.status === "delivered";
            return (
              <li key={row.payment_id} className="flex flex-wrap items-center gap-3 py-3">
                <span className={ok ? "text-emerald-600" : "text-amber-600"}>
                  {ok ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {row.invoice_number ?? "—"} · {row.email ?? row.user_id ?? "onbekend"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.template ?? "—"} · PDF {row.attached ? "ok" : "ontbreekt"} · mail{" "}
                    {row.emailed ? "verzonden" : "mislukt"}
                    {row.amount_cents != null ? ` · €${(row.amount_cents / 100).toFixed(2)}` : ""}
                    {row.error ? ` · ${row.error}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {row.attempts}×
                </span>
                <Button
                  size="sm"
                  variant={ok ? "ghost" : "default"}
                  disabled={busy === row.payment_id}
                  onClick={() => void onRetry(row.payment_id)}
                >
                  {busy === row.payment_id ? "Bezig…" : "Opnieuw versturen"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
