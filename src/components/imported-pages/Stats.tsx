import { errorMessage } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { AppLayout } from "@/components/layout/AppLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Copy,
  Download,
  RefreshCw,
  Power,
  PowerOff,
  CalendarClock,
  Save,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db/client";
import { allocateSlug, shortLinkQrValue, shortLinkUrl } from "@/lib/short-links";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { i18n as trI18n } from "@/lib/i18n";

interface Scan {
  scanned_at: string;
  country: string | null;
  device: string | null;
  browser?: string | null;
  os?: string | null;
}

interface Tracked {
  id: string;
  slug: string;
  target_type: string;
  target_url: string;
  label: string | null;
  created_at: string;
  redirect_url: string;
  is_active: boolean;
  expires_at: string | null;
}

interface RawScan {
  scanned_at: string;
  country: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
}

interface StatsResponse {
  tracked: Tracked;
  scans: Scan[];
  total: number;
}

function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export default function Stats() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [expiryInput, setExpiryInput] = useState("");
  const [targetInput, setTargetInput] = useState("");

  useTitle("QR scan analytics");

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // The dashboard token itself is the credential; the lookup runs through a
      // database function so no other link is ever readable.
      const { data: raw, error: rpcError } = await (
        db as unknown as {
          rpc: (
            fn: string,
            args: unknown,
          ) => Promise<{ data: unknown; error: { message: string } | null }>;
        }
      ).rpc("short_link_stats", {
        _token: token,
      });
      if (rpcError) throw new Error(rpcError.message);
      if (!raw) {
        setError("Dashboard not found.");
        setLoading(false);
        return;
      }
      const payload = raw as unknown as { qr: Record<string, unknown>; scans: RawScan[] };
      const qr = payload.qr as unknown as Tracked & { custom_domain: string | null };
      const scans = (payload.scans ?? []).map((s) => ({
        scanned_at: s.scanned_at,
        country: s.country,
        device: s.device,
        browser: s.browser,
        os: s.os,
      }));
      const json: StatsResponse = {
        tracked: { ...qr, redirect_url: shortLinkQrValue(qr.slug, qr.custom_domain) },
        scans,
        total: scans.length,
      };
      setData(json);
      setExpiryInput(json.tracked.expires_at ? json.tracked.expires_at.slice(0, 16) : "");
      setTargetInput(json.tracked.target_url);
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const byDay = useMemo(() => {
    if (!data) return [] as { date: string; count: number }[];
    const map = new Map<string, number>();
    for (const s of data.scans) {
      const d = new Date(s.scanned_at);
      const key = d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const out: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, count: map.get(key) ?? 0 });
    }
    return out;
  }, [data]);

  const maxCount = Math.max(1, ...byDay.map((d) => d.count));

  const groupBy = (arr: Scan[], key: "country" | "device" | "browser" | "os") => {
    const map = new Map<string, number>();
    for (const s of arr) {
      const k = (s[key] ?? "Unknown") as string;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  };

  const countries = data ? groupBy(data.scans, "country") : [];
  const devices = data ? groupBy(data.scans, "device") : [];
  const browsers = data ? groupBy(data.scans, "browser") : [];
  const operatingSystems = data ? groupBy(data.scans, "os") : [];

  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(trI18n.t("ui.8e3df45a49"));
    } catch {
      toast.error(trI18n.t("ui.bd5acbff63"));
    }
  };

  const downloadCsv = () => {
    if (!data) return;
    const header = "scanned_at,country,device,browser,os";
    const rows = data.scans.map((s) =>
      [s.scanned_at, s.country ?? "", s.device ?? "", s.browser ?? "", s.os ?? ""]
        .map((v) => {
          // Neutralise spreadsheet formulas (=, +, -, @, tab, CR) from visitor data.
          const text = String(v).replace(/^[=+\-@\t\r]/, "'$&");
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    const objUrl = URL.createObjectURL(blob);
    a.href = objUrl;
    a.download = `qr-scans-${data.tracked.slug}.csv`;
    a.click();
    URL.revokeObjectURL(objUrl);
  };

  const manage = async (body: Record<string, unknown>, successMsg: string) => {
    if (!token) return;
    setManaging(true);
    try {
      const { error } = await (
        db as unknown as {
          rpc: (fn: string, args: unknown) => Promise<{ error: { message: string } | null }>;
        }
      ).rpc("manage_short_link", {
        _token: token,
        _action: body.action as string,
        _target_url: (body.target_url as string | undefined) ?? null,
        _is_active: (body.is_active as boolean | undefined) ?? null,
        _expires_at: (body.expires_at as string | null | undefined) ?? null,
        _slug: (body.slug as string | undefined) ?? null,
      });
      if (error) throw new Error(error.message);
      toast.success(successMsg);
      await load();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Action failed"));
    } finally {
      setManaging(false);
    }
  };

  const regenerate = async () => {
    if (!confirm("Regenerate the short link? Existing printed QR codes will stop working.")) return;
    const slug = await allocateSlug();
    if (!slug) {
      toast.error(trI18n.t("ui.e44e6971eb"));
      return;
    }
    manage({ action: "regenerate_slug", slug }, "New short link generated");
  };
  const toggleActive = () => {
    if (!data) return;
    manage(
      { action: "set_active", is_active: !data.tracked.is_active },
      data.tracked.is_active ? "Link disabled" : "Link enabled",
    );
  };
  const saveTarget = () => {
    const raw = targetInput.trim();
    if (!raw) {
      toast.error(t("stats.targetInvalid"));
      return;
    }
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(normalized);
      if (!u.hostname.includes(".")) throw new Error("bad host");
    } catch {
      toast.error(t("stats.targetInvalid"));
      return;
    }
    manage({ action: "set_target", target_url: normalized }, t("stats.targetSaved"));
  };

  const saveExpiry = () => {
    manage(
      {
        action: "set_expiry",
        expires_at: expiryInput ? new Date(expiryInput).toISOString() : null,
      },
      expiryInput ? "Expiry updated" : "Expiry cleared",
    );
  };

  const expired = data?.tracked.expires_at
    ? new Date(data.tracked.expires_at).getTime() < Date.now()
    : false;

  return (
    <AppLayout
      crumbs={[{ label: t("stats.title") }]}
      title={t("stats.title")}
      description={t("stats.privateDashboard")}
    >
      <div className="pb-28">
        {!user && (
          <div className="mb-8 rounded-2xl border border-border bg-muted/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <UserPlus className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground flex-1">{t("stats.claimBody")}</p>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to="/auth/sign-in">{t("stats.claimCta")}</Link>
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("stats.loading")}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-foreground mb-2">{error}</p>
            <Button onClick={load} variant="outline" size="sm">
              {t("stats.retry")}
            </Button>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <div
              className="rounded-2xl border border-border bg-card p-6"
              style={{
                boxShadow:
                  "0 14px 8px 0 rgba(64, 64, 64, 0.04), 0 6px 6px 0 rgba(64, 64, 64, 0.07), 0 2px 3px 0 rgba(64, 64, 64, 0.08)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("stats.totalScans")}
                  </p>
                  <p className="text-5xl font-medium text-foreground mt-1">
                    {formatNumber(data.total, locale)}
                  </p>
                  {data.tracked.label && (
                    <p className="text-sm text-muted-foreground mt-2">{data.tracked.label}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3 text-xs">
                    {!data.tracked.is_active ? (
                      <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                        {t("stats.disabled")}
                      </span>
                    ) : expired ? (
                      <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                        {t("stats.expired")}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                        {t("stats.active")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t("stats.created")}</p>
                  <p className="text-sm">{formatDate(data.tracked.created_at, locale)}</p>
                  <Button
                    onClick={downloadCsv}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={data.total === 0}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> {t("stats.exportCsv")}
                  </Button>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div className="space-y-2">
                  <label htmlFor="target-url" className="text-xs text-muted-foreground block">
                    {t("stats.editTarget")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="target-url"
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      className="h-10 flex-1 min-w-[14rem] text-sm"
                      placeholder="https://example.com"
                    />
                    <Button
                      onClick={saveTarget}
                      disabled={managing || targetInput.trim() === data.tracked.target_url}
                      size="sm"
                      className="h-10"
                    >
                      <Save className="w-3.5 h-3.5 mr-1.5" /> {t("stats.saveChanges")}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t("stats.editTargetHint")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("stats.shortLink")}</p>
                  <div className="flex gap-2 items-center">
                    <code className="text-xs break-all">{data.tracked.redirect_url}</code>
                    <button
                      onClick={() => copy(data.tracked.redirect_url)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Copy"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Manage */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="text-lg font-medium">{t("stats.manageLink")}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  onClick={regenerate}
                  disabled={managing}
                  variant="outline"
                  className="justify-start"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> {t("stats.regenerate")}
                </Button>
                <Button
                  onClick={toggleActive}
                  disabled={managing}
                  variant="outline"
                  className="justify-start"
                >
                  {data.tracked.is_active ? (
                    <>
                      <PowerOff className="w-4 h-4 mr-2" /> {t("stats.disable")}
                    </>
                  ) : (
                    <>
                      <Power className="w-4 h-4 mr-2" /> {t("stats.enable")}
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" /> {t("stats.expiry")}
                </label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="datetime-local"
                    value={expiryInput}
                    onChange={(e) => setExpiryInput(e.target.value)}
                    className="h-10 max-w-xs"
                  />
                  <Button onClick={saveExpiry} disabled={managing} size="sm" className="h-10">
                    {t("stats.saveExpiry")}
                  </Button>
                  {data.tracked.expires_at && (
                    <Button
                      onClick={() => {
                        setExpiryInput("");
                        manage({ action: "set_expiry", expires_at: null }, "Expiry cleared");
                      }}
                      disabled={managing}
                      variant="ghost"
                      size="sm"
                      className="h-10"
                    >
                      {t("stats.clear")}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{t("stats.expiryHint")}</p>
              </div>

              <p className="text-[11px] text-muted-foreground">{t("stats.regenerateHint")}</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-lg font-medium mb-4">{t("stats.last14")}</h2>
              <div className="flex items-end gap-1 h-40">
                {byDay.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t bg-foreground/80"
                        style={{
                          height: `${(d.count / maxCount) * 100}%`,
                          minHeight: d.count > 0 ? 4 : 1,
                        }}
                        title={`${d.date}: ${d.count}`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <BreakdownCard title={t("stats.countries")} rows={countries} total={data.total} />
              <BreakdownCard title={t("stats.devices")} rows={devices} total={data.total} />
              <BreakdownCard title={t("stats.browsers")} rows={browsers} total={data.total} />
              <BreakdownCard title={t("stats.os")} rows={operatingSystems} total={data.total} />
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-lg font-medium mb-4">{t("stats.recent")}</h2>
              {data.scans.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("stats.noScans")}</p>
              ) : (
                <div className="divide-y divide-border">
                  {data.scans.slice(0, 25).map((s, i) => (
                    <div key={i} className="py-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {formatDateTime(s.scanned_at, locale)}
                      </span>
                      <span className="text-foreground">
                        {s.country ?? "—"} · {s.device ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function BreakdownCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: [string, number][];
  total: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-medium mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 8).map(([k, v]) => {
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            return (
              <div key={k}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-foreground">{k}</span>
                  <span className="text-muted-foreground">
                    {v} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-foreground/70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
