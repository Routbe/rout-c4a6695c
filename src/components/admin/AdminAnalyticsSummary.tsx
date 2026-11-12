import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { logQuietly } from "@/lib/notify";
import { getSystemHealth, getSystemHealthRows } from "@/lib/admin.functions";
import type { Health, KpiMetric } from "@/types/admin";

/**
 * KPI/metrics summary header: the health tiles plus the drilldown dialog that
 * lists the profiles behind a clicked tile.
 */
export function AdminAnalyticsSummary({ allowed }: { allowed: boolean }) {
  const { t } = useTranslation();
  const loadHealth = useServerFn(getSystemHealth);
  const loadHealthRows = useServerFn(getSystemHealthRows);

  const [health, setHealth] = useState<Health | null>(null);
  // KPI-drilldown: op welke tegel is geklikt en welke profielen horen daarbij.
  const [kpiDrill, setKpiDrill] = useState<{ metric: KpiMetric; label: string } | null>(null);
  const [kpiRows, setKpiRows] = useState<Awaited<ReturnType<typeof getSystemHealthRows>> | null>(
    null,
  );

  useEffect(() => {
    if (!allowed) return;
    loadHealth({})
      .then(setHealth)
      .catch((error) => logQuietly("admin:health", error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  /** Opent de lijst met profielen achter een KPI-tegel. */
  const openKpiDrill = (metric: KpiMetric, label: string) => {
    setKpiDrill({ metric, label });
    setKpiRows(null);
    void loadHealthRows({ data: { metric } })
      .then((rows) => setKpiRows(rows))
      .catch(() => setKpiRows([]));
  };

  return (
    <>
      {health ? (
        <section
          data-testid="admin-health-kpis"
          className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-5"
        >
          {(
            [
              [t("admin.kpi.active_users"), health.activeUsers, "activeUsers"],
              [
                t("admin.kpi.pending_verifications"),
                health.pendingVerifications,
                "pendingVerifications",
              ],
              [
                t("admin.kpi.incomplete_payments"),
                health.incompletePayments,
                "incompletePayments",
              ],
              [t("admin.kpi.pending_sepa"), health.pendingSepaPayments, "pendingSepaPayments"],
              [t("admin.kpi.failed_alias"), health.failedAliasSyncs, "failedAliasSyncs"],
              [
                t("admin.kpi.improvmx"),
                health.improvmxConfigured
                  ? t("admin.kpi.configured")
                  : t("admin.kpi.not_configured"),
                null,
              ],
            ] as Array<[string, string | number, KpiMetric | null]>
          ).map(([label, value, metric]) => (
            <div key={label} className="space-y-0.5">
              <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <Activity className="h-3 w-3" aria-hidden /> {label}
              </p>
              {metric ? (
                <button
                  type="button"
                  onClick={() => openKpiDrill(metric, label)}
                  className="text-lg font-semibold underline decoration-dotted underline-offset-4 hover:text-primary"
                  title="Toon de profielen achter dit getal"
                >
                  {value}
                </button>
              ) : (
                <p className="text-lg font-semibold">{value}</p>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {/* KPI-drilldown: profielen achter een getal ------------------------ */}
      <Dialog open={Boolean(kpiDrill)} onOpenChange={(open) => !open && setKpiDrill(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{kpiDrill?.label}</DialogTitle>
            <DialogDescription>
              {kpiRows === null
                ? "Profielen laden…"
                : `${kpiRows.length} profiel${kpiRows.length === 1 ? "" : "en"}`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {kpiRows?.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen profielen gevonden.</p>
            ) : null}
            {(kpiRows ?? []).map((row) => (
              <div
                key={`${row.userId}-${row.detail ?? ""}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.displayName || row.username || row.userId}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.username ? `@${row.username}` : row.userId}
                    {row.detail ? ` · ${row.detail}` : ""}
                  </p>
                </div>
                {row.username ? (
                  <a
                    href={`/${row.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs underline"
                  >
                    Profiel
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
