import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Download, Loader2, RefreshCw, Search, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { decideSepaReviewRow, listSepaReviewQueue } from "@/lib/sepa-review.functions";
import { useI18n } from "@/lib/i18n";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { logQuietly } from "@/lib/notify";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  payment_id: string | null;
  user_id: string | null;
  reason: string;
  status: "open" | "approved" | "rejected";
  reference: string | null;
  amount_cents: number | null;
  expected_cents: number | null;
  payer_name: string | null;
  holder_name: string | null;
  match_score: number | null;
  notes: string | null;
  decided_at: string | null;
  created_at: string;
  member_email: string | null;
  member_name: string | null;
};

const FILTERS = ["open", "approved", "rejected", "all"] as const;

function euro(cents: number | null): string {
  return cents === null ? "—" : `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function ScoreChip({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round(score * 100);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
        pct >= 85 && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        pct >= 55 && pct < 85 && "border-amber-500/40 text-amber-600 dark:text-amber-400",
        pct < 55 && "border-destructive/40 text-destructive",
      )}
    >
      {pct}%
    </span>
  );
}

/**
 * /dashboard/admin/sepa — the level 2b queue: transfers whose amount matches a
 * pending payment but whose payer name differs from the account holder. An
 * admin approves (settle + activate) or rejects each row.
 */
export default function AdminSepaReview() {
  const { t, locale } = useI18n();
  const fetchQueue = useServerFn(listSepaReviewQueue);
  const decide = useServerFn(decideSepaReviewRow);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("open");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchQueue({
        data: { status, search: search || undefined, limit: 200 },
      });
      setRows(data.rows as Row[]);
      setCounts(data.counts as Record<string, number>);
      setError(null);
    } catch (err) {
      logQuietly("admin-sepa-review", err);
      setRows([]);
      setError(t("admin.sepa.loadFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [fetchQueue, status, search, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = counts["open"] ?? 0;

  const submitDecision = async (row: Row, decision: "approved" | "rejected") => {
    setBusy(row.id);
    try {
      const result = await decide({
        data: { id: row.id, decision, ...(note.trim() ? { notes: note.trim() } : {}) },
      });
      if (!result.ok) setError(result.error ?? t("admin.sepa.decideFailed"));
      setSelected(null);
      setNote("");
      await load();
    } catch (err) {
      logQuietly("admin-sepa-decide", err);
      setError(t("admin.sepa.decideFailed"));
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    if (!rows || rows.length === 0) return;
    const csv = toCsv(
      rows.map((r) => ({
        created_at: r.created_at,
        status: r.status,
        reason: r.reason,
        reference: r.reference ?? "",
        amount_eur: r.amount_cents === null ? "" : (r.amount_cents / 100).toFixed(2),
        expected_eur: r.expected_cents === null ? "" : (r.expected_cents / 100).toFixed(2),
        payer_name: r.payer_name ?? "",
        holder_name: r.holder_name ?? "",
        match_score: r.match_score ?? "",
        member_email: r.member_email ?? "",
        decided_at: r.decided_at ?? "",
      })),
      [
        "created_at",
        "status",
        "reason",
        "reference",
        "amount_eur",
        "expected_eur",
        "payer_name",
        "holder_name",
        "match_score",
        "member_email",
        "decided_at",
      ],
    );
    downloadCsv(`rout-sepa-review-${status}.csv`, csv);
  };

  const empty = useMemo(() => rows !== null && rows.length === 0, [rows]);

  return (
    <AppLayout>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium sm:text-2xl">{t("admin.sepa.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.sepa.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            {t("admin.sepa.refresh")}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={exportCsv} disabled={empty}>
            <Download className="h-4 w-4" aria-hidden />
            {t("admin.sepa.export")}
          </Button>
        </div>
      </header>

      {openCount > 0 ? (
        <p className="mb-3 inline-flex items-center gap-2 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          {t("admin.sepa.openCount").replace("{count}", String(openCount))}
        </p>
      ) : null}

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
            {t(`admin.sepa.filter.${f}`)}
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
            placeholder={t("admin.sepa.search")}
            className="pl-8"
          />
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t("admin.sepa.col.received")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.sepa.col.payer")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.sepa.col.holder")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.sepa.col.score")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.sepa.col.amount")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.sepa.col.reference")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.sepa.col.status")}</th>
              <th className="px-3 py-2 font-medium text-right">{t("admin.sepa.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  {t("admin.sepa.loading")}
                </td>
              </tr>
            ) : empty ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  {t("admin.sepa.empty")}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border/70">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {formatDateTime(row.created_at, locale)}
                  </td>
                  <td className="px-3 py-2">{row.payer_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {row.holder_name ?? row.member_name ?? "—"}
                    {row.member_email ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.member_email}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <ScoreChip score={row.match_score} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {euro(row.amount_cents)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.reference ?? "—"}</td>
                  <td className="px-3 py-2">{t(`admin.sepa.status.${row.status}`)}</td>
                  <td className="px-3 py-2 text-right">
                    {row.status === "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(row);
                          setNote("");
                        }}
                      >
                        {t("admin.sepa.review")}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {row.decided_at ? formatDateTime(row.decided_at, locale) : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.sepa.dialog.title")}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">{t("admin.sepa.col.payer")}</dt>
                <dd>{selected.payer_name ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("admin.sepa.col.holder")}</dt>
                <dd>{selected.holder_name ?? selected.member_name ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("admin.sepa.col.score")}</dt>
                <dd>
                  <ScoreChip score={selected.match_score} />
                </dd>
                <dt className="text-muted-foreground">{t("admin.sepa.col.amount")}</dt>
                <dd className="tabular-nums">
                  {euro(selected.amount_cents)}
                  {selected.expected_cents !== null &&
                  selected.expected_cents !== selected.amount_cents
                    ? ` / ${euro(selected.expected_cents)}`
                    : ""}
                </dd>
                <dt className="text-muted-foreground">{t("admin.sepa.col.reference")}</dt>
                <dd className="font-mono text-xs">{selected.reference ?? "—"}</dd>
              </dl>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("admin.sepa.notes")}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">{t("admin.sepa.dialog.help")}</p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={busy === selected.id}
                  onClick={() => void submitDecision(selected, "rejected")}
                >
                  <X className="h-4 w-4" aria-hidden />
                  {t("admin.sepa.reject")}
                </Button>
                <Button
                  className="gap-1.5"
                  disabled={busy === selected.id}
                  onClick={() => void submitDecision(selected, "approved")}
                >
                  {busy === selected.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  {t("admin.sepa.approve")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
