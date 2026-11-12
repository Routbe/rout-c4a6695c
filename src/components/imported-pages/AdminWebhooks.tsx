import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listWebhookEvents } from "@/lib/monitoring.functions";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { logQuietly } from "@/lib/notify";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  source: string;
  kind: string | null;
  status: string;
  outcome: string | null;
  idempotency_key: string | null;
  attempts: number;
  error: string | null;
  payload: string | null;
  created_at: string;
  processed_at: string | null;
};

const FILTERS = ["all", "success", "failed", "processing"] as const;

function StatusChip({ status }: { status: string }) {
  const Icon = status === "success" ? CheckCircle2 : status === "failed" ? AlertTriangle : Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        status === "success" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        status === "failed" && "border-destructive/40 text-destructive",
        status !== "success" && status !== "failed" && "border-border text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {status}
    </span>
  );
}

/**
 * /dashboard/admin/webhooks — admin-only monitor for every Stripe & SEPA
 * webhook delivery: event id, idempotency key, attempts, outcome and the full
 * payload plus stack trace for troubleshooting.
 */
export default function AdminWebhooks() {
  const { t, locale } = useI18n();
  const fetchEvents = useServerFn(listWebhookEvents);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchEvents({ data: { status, search: search || undefined, limit: 200 } });
      setRows(data as Row[]);
    } catch (error) {
      logQuietly("admin-webhooks", error);
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchEvents, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const failed = useMemo(() => (rows ?? []).filter((r) => r.status === "failed").length, [rows]);

  return (
    <AppLayout>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium sm:text-2xl">{t("admin.webhooks.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.webhooks.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          {t("admin.webhooks.refresh")}
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatus(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              status === f ? "border-foreground bg-foreground text-background" : "border-border",
            )}
          >
            {t(`admin.webhooks.filter.${f}`)}
          </button>
        ))}
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.webhooks.search")}
            aria-label={t("admin.webhooks.search")}
            className="pl-8"
          />
        </div>
      </div>

      {failed > 0 ? (
        <p className="mb-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {t("admin.webhooks.failedNotice", { count: failed })}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {!rows ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("admin.webhooks.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("admin.webhooks.col.event")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.webhooks.col.type")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.webhooks.col.received")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.webhooks.col.status")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.webhooks.col.idempotency")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                    <td className="px-3 py-2 text-xs">{row.kind ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(row.created_at, locale)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={row.status} />
                      {row.attempts > 1 ? (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          ×{row.attempts}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      {row.idempotency_key ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
                        {t("admin.webhooks.details")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{selected?.id}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <dt className="text-muted-foreground">{t("admin.webhooks.col.type")}</dt>
                <dd>{selected.kind ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("admin.webhooks.col.status")}</dt>
                <dd>
                  {selected.status}
                  {selected.outcome ? ` — ${selected.outcome}` : ""}
                </dd>
                <dt className="text-muted-foreground">{t("admin.webhooks.col.idempotency")}</dt>
                <dd className="font-mono">{selected.idempotency_key ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("admin.webhooks.attempts")}</dt>
                <dd>{selected.attempts}</dd>
                <dt className="text-muted-foreground">{t("admin.webhooks.processed")}</dt>
                <dd>
                  {selected.processed_at ? formatDateTime(selected.processed_at, locale) : "—"}
                </dd>
              </dl>
              {selected.error ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-destructive">
                    {t("admin.webhooks.error")}
                  </p>
                  <pre className="max-h-56 overflow-auto rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[11px] leading-relaxed">
                    {selected.error}
                  </pre>
                </div>
              ) : null}
              <div>
                <p className="mb-1 text-xs font-medium">{t("admin.webhooks.payload")}</p>
                <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
                  {selected.payload ?? "{}"}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
