import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Mail, RefreshCw, Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listContactSubmissions } from "@/lib/contact-admin.functions";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { logQuietly, notifyError } from "@/lib/notify";
import { downloadCsv, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { ContactTriagePanel } from "@/components/admin/ContactTriagePanel";
import { myAdminPermissions } from "@/lib/admin-access.functions";

type Row = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  locale: string;
  status: string;
  error_detail: string | null;
  created_at: string;
};

const FILTERS = ["all", "pending", "sent", "sent_partial", "failed"] as const;
type Filter = (typeof FILTERS)[number];

function StatusChip({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        status === "sent" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        status === "failed" && "border-destructive/40 text-destructive",
        status === "sent_partial" && "border-amber-500/40 text-amber-600 dark:text-amber-400",
        status === "pending" && "border-border text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

/**
 * /dashboard/admin/contact — admin-only overview of every contact form
 * submission with status filtering, a period filter and CSV export.
 */
export default function AdminContact() {
  const { t, locale } = useI18n();
  const fetchRows = useServerFn(listContactSubmissions);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetchAccess = useServerFn(myAdminPermissions);
  const [fullAdmin, setFullAdmin] = useState(false);
  const [accessLoaded, setAccessLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchAccess().then(access => { if (active) setFullAdmin(access.fullAdmin); }).catch(() => {}).finally(() => { if (active) setAccessLoaded(true); });
    return () => { active = false; };
  }, [fetchAccess]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchRows({
        data: {
          status,
          search: search || undefined,
          from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
          limit: 500,
        },
      });
      setRows(data as Row[]);
    } catch (error) {
      logQuietly("admin-contact", error);
      notifyError(t("admin.contact.loadFailed"), { key: "admin-contact:load" });
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchRows, status, search, from, to, t]);

  useEffect(() => {
    if (fullAdmin) void load();
  }, [load, fullAdmin]);

  const statusLabel = useCallback((value: string) => t(`admin.contact.status.${value}`), [t]);

  const exportCsv = () => {
    if (!rows || rows.length === 0) return;
    const csv = toCsv(
      rows.map((r) => ({
        created_at: r.created_at,
        name: r.name,
        email: r.email,
        subject: r.subject,
        locale: r.locale,
        status: r.status,
        message: r.message,
        error_detail: r.error_detail ?? "",
      })),
      ["created_at", "name", "email", "subject", "locale", "status", "message", "error_detail"],
    );
    const period = [from || "start", to || "now"].join("_");
    downloadCsv(`rout-contact-${status}-${period}.csv`, csv);
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [rows]);

  return (
    <AppLayout crumbs={[{ label: t("admin.contact.title") }]}>
      <div className="mx-auto w-full max-w-5xl space-y-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-foreground">{t("admin.contact.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("admin.contact.subtitle")}</p>
          </div>
          {fullAdmin && <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              )}
              {t("admin.contact.refresh")}
            </Button>
            <Button size="sm" onClick={exportCsv} disabled={!rows || rows.length === 0}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              {t("admin.contact.export")}
            </Button>
          </div>}
        </header>

        <ContactTriagePanel />

        {accessLoaded && fullAdmin && <>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatus(f)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                status === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {statusLabel(f)}
              {f !== "all" && counts.get(f) ? ` (${counts.get(f)})` : ""}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.contact.search")}
              className="pl-9"
            />
          </div>
          <Input
            type="date"
            aria-label={t("admin.contact.from")}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            type="date"
            aria-label={t("admin.contact.to")}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border">
          {rows === null ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("admin.contact.loading")}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {t("admin.contact.empty")}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("admin.contact.col.received")}</th>
                  <th className="px-4 py-3 font-medium">{t("admin.contact.col.sender")}</th>
                  <th className="px-4 py-3 font-medium">{t("admin.contact.col.subject")}</th>
                  <th className="px-4 py-3 font-medium">{t("admin.contact.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer border-t border-border/60 hover:bg-muted/30"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDateTime(row.created_at, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-foreground">{row.name}</span>
                      <span className="block text-xs text-muted-foreground">{row.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      {row.subject}
                      <span className="ml-2 text-xs uppercase text-muted-foreground">
                        {row.locale}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={row.status} label={statusLabel(row.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.subject}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {selected.name} · {selected.email} · {formatDateTime(selected.created_at, locale)}
              </p>
              <StatusChip status={selected.status} label={statusLabel(selected.status)} />
              <ContactTriagePanel key={selected.id} initialMessage={`${selected.subject}\n\n${selected.message}`} />
              <p className="whitespace-pre-line rounded-xl border border-border bg-muted/30 p-4">
                {selected.message}
              </p>
              {selected.error_detail ? (
                <p className="whitespace-pre-line rounded-xl border border-destructive/40 p-3 text-xs text-destructive">
                  {selected.error_detail}
                </p>
              ) : null}
              <Button asChild variant="outline" className="w-full">
                <a
                  href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject}`)}`}
                >
                  <Mail className="mr-2 h-4 w-4" aria-hidden /> {t("admin.contact.reply")}
                </a>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
