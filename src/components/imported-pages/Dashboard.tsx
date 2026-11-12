import { BrandLoader } from "@/components/BrandLoader";
import { DocHelpLink } from "@/components/seo/DocHelpLink";
import { FirstUseTour } from "@/components/onboarding/FirstUseTour";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import {
  Copy,
  Download,
  Edit3,
  Globe,
  Loader2,
  MoreHorizontal,
  Plus,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppLayout } from "@/components/layout/AppLayout";
import { QrsPanel } from "@/components/dashboard/QrsPanel";
import { IdentityCard } from "@/components/dashboard/IdentityCard";
import { NotificationsPanel } from "@/components/dashboard/NotificationsPanel";
import { BadgeActivityPanel } from "@/components/dashboard/BadgeActivityPanel";
import { VisitorPanel } from "@/components/dashboard/VisitorPanel";
import { ShortLinksPanel } from "@/components/dashboard/ShortLinksPanel";
import { AssetManagerPanel } from "@/components/dashboard/AssetManagerPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { db } from "@/lib/db/client";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardOverview } from "@/lib/dashboard.functions";
import { toast } from "sonner";

interface Totals {
  saved: number;
  tracked: number;
  scans: number;
  /** Scan counts per day for the last 14 days, oldest first. */
  trend: number[];
}

interface RecentQr {
  id: string;
  name: string;
  type: string;
  created_at: string;
  scans: number;
}

/** Dense metric tile: three fit side by side even on a 360px screen. */
function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-medium leading-none sm:text-2xl">{value}</p>
      {hint ? (
        <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground sm:text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** Tiny dependency-free sparkline of the last 14 days of scans. */
function Sparkline({ data }: { data: number[] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-16 items-end gap-1" role="img" aria-label={t("studio.dashboard.trendLabel")}>
      {data.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-sm bg-foreground/80"
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * /dashboard — the utility & data hub: saved QR codes, short links and
 * privacy-first aggregated analytics. No page builders live here (that's
 * /studio), which keeps this route light on mobile.
 */
export type AssetsTab = "overview" | "qrs" | "links" | "files";

export default function Dashboard({ initialTab = "overview" }: { initialTab?: AssetsTab } = {}) {
  const { locale, t } = useI18n();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const loadOverview = useServerFn(getDashboardOverview);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [recent, setRecent] = useState<RecentQr[] | null>(null);

  useEffect(() => {
    if (!loading && !user) nav("/auth/sign-in", { replace: true });
  }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const overview = await loadOverview();
      if (alive) setTotals(overview);
    })();
    return () => {
      alive = false;
    };
  }, [user, loadOverview]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const [{ data: s }, { data: t }] = await Promise.all([
        db
          .from("saved_qrs")
          .select("id, name, qr_type, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        db
          .from("tracked_qrs")
          .select("id, label, target_type, target_url, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      const trackedRows = (t ?? []) as {
        id: string;
        label: string | null;
        target_type: string;
        target_url: string;
        created_at: string;
      }[];
      const scanCounts = new Map<string, number>();
      if (trackedRows.length) {
        const ids = trackedRows.map((r) => r.id);
        const { data: scans } = await db
          .from("qr_scans")
          .select("tracked_qr_id")
          .in("tracked_qr_id", ids);
        for (const row of scans ?? [])
          scanCounts.set(row.tracked_qr_id, (scanCounts.get(row.tracked_qr_id) ?? 0) + 1);
      }
      const merged: RecentQr[] = [
        ...trackedRows.map((r) => ({
          id: r.id,
          name: r.label || r.target_url,
          type: r.target_type || "Link",
          created_at: r.created_at,
          scans: scanCounts.get(r.id) ?? 0,
        })),
        ...((s ?? []) as { id: string; name: string; qr_type: string; created_at: string }[]).map(
          (r) => ({
            id: r.id,
            name: r.name,
            type: r.qr_type,
            created_at: r.created_at,
            scans: 0,
          }),
        ),
      ]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 5);
      if (alive) setRecent(merged);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const hasTrend = useMemo(() => (totals?.trend ?? []).some((v) => v > 0), [totals]);

  if (loading || !user) {
    return (
      <AppLayout title={t("studio.dashboard.title")}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="relative h-24 w-24">
            <BrandLoader label={t("studio.dashboard.loading")} />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title={t("studio.dashboard.title")}
      description={t("studio.dashboard.description")}
      crumbs={[{ label: "Command Center", to: "/dashboard" }, { label: "Assets" }]}
      actions={
        <>
          <div className="hidden flex-wrap gap-2 sm:flex">
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/dashboard/profile">
                <UserRound className="h-4 w-4" /> {t("studio.dashboard.profile")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/studio">
                <Sparkles className="h-4 w-4" /> {t("studio.dashboard.studio")}
              </Link>
            </Button>

            <Button asChild size="sm" className="gap-1.5">
              <Link to="/">
                <Plus className="h-4 w-4" /> {t("studio.dashboard.new")}
              </Link>
            </Button>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:hidden">
            <Button asChild size="sm" variant="outline" className="min-h-12 min-w-0 gap-1.5">
              <Link to="/studio">
                <Sparkles className="h-4 w-4" /> {t("studio.dashboard.studio")}
              </Link>
            </Button>
            <Button asChild size="sm" className="min-h-12 min-w-0 gap-1.5 bg-primary text-primary-foreground">
              <Link to="/">
                <Plus className="h-4 w-4" /> {t("studio.dashboard.new")}
              </Link>
            </Button>
          </div>
        </>
      }
    >
      <FirstUseTour area="dashboard" userId={user.id} />
      <IdentityCard />
      <DocHelpLink to="/features/link-management">Lees over link aliassen</DocHelpLink>

      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="overview" data-tour="dashboard-overview">{t("studio.dashboard.overview")}</TabsTrigger>
          <TabsTrigger value="qrs" data-tour="dashboard-qrs">{t("studio.dashboard.qrs")}</TabsTrigger>
          <TabsTrigger value="links" data-tour="dashboard-links">{t("studio.dashboard.links")}</TabsTrigger>
          <TabsTrigger value="files" data-tour="dashboard-files">{t("studio.dashboard.files")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
      <section aria-label={t("studio.dashboard.analytics")} className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Metric label={t("studio.dashboard.saved")} value={totals?.saved ?? "—"} />
        <Metric label={t("studio.dashboard.short")} value={totals?.tracked ?? "—"} hint={t("studio.dashboard.repoint")} />
        <Metric label={t("studio.dashboard.total")} value={totals?.scans ?? "—"} hint={t("studio.dashboard.cookies")} />
      </section>

      <section className="mb-4 rounded-2xl border border-border bg-card p-3.5 sm:p-5">
        <DocHelpLink to="/features/cookieless-analytics">Ontdek hoe onze privacy-first statistieken werken</DocHelpLink>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
          <h2 className="truncate text-sm font-medium">{t("studio.dashboard.trend")}</h2>
          <span className="shrink-0 text-xs text-muted-foreground">
            {totals ? totals.trend.reduce((a, b) => a + b, 0) : 0} scans
          </span>
        </div>
        <div className="mt-3">
          {hasTrend ? (
            <Sparkline data={totals?.trend ?? []} />
          ) : (
            <p className="py-4 text-xs text-muted-foreground">
              {t("studio.dashboard.empty")}
            </p>
          )}
        </div>
      </section>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/">
                <Plus className="h-4 w-4" /> {t("studio.dashboard.newNl")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/studio">
                <Sparkles className="h-4 w-4" /> {t("studio.dashboard.studioNl")}
              </Link>
            </Button>
          </div>
          <div className="mb-4 space-y-4">
            <VisitorPanel />
            <NotificationsPanel />
            <BadgeActivityPanel />
          </div>
      <section className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3.5 sm:mb-8 sm:p-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{t("studio.dashboard.domain")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("studio.dashboard.domainHelp")}
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
          <Link to="/dashboard/domains">
            <Globe className="h-4 w-4" /> {t("studio.dashboard.connect")}
          </Link>
        </Button>
      </section>

        </TabsContent>

        <TabsContent value="qrs" className="space-y-4">
          <div className="flex justify-end">
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/studio">
                <Edit3 className="h-4 w-4" /> {t("studio.dashboard.editStudio")}
              </Link>
            </Button>
          </div>
      <section className="mb-4 rounded-2xl border border-border bg-card p-3.5 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">{t("studio.dashboard.recent")}</h2>
          <Link
            to="/dashboard/routes"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            {t("studio.dashboard.all")}
          </Link>
        </div>
        {!recent ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-xl bg-muted/40 p-6 text-center text-xs text-muted-foreground">
            {t("studio.dashboard.emptyQrs")}
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="capitalize">{item.type}</span>
                    <span aria-hidden>·</span>
                    <span>{formatDate(item.created_at, locale)}</span>
                    <span aria-hidden>·</span>
                    <span>{item.scans} scans</span>
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={t("studio.dashboard.actions")}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card">
                    <DropdownMenuItem asChild className="gap-2">
                      <Link to="/">
                        <Edit3 className="h-4 w-4" /> {t("studio.dashboard.edit")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => {
                        void navigator.clipboard.writeText(window.location.origin);
                        toast.success(t("studio.dashboard.copied"));
                      }}
                    >
                      <Copy className="h-4 w-4" /> {t("studio.dashboard.copy")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => toast.info(t("studio.dashboard.preparing"))}
                    >
                      <Download className="h-4 w-4" /> {t("studio.dashboard.download")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </section>

          <QrsPanel />
        </TabsContent>

        <TabsContent value="links">
          <ShortLinksPanel />
        </TabsContent>

        <TabsContent value="files">
          <AssetManagerPanel />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
