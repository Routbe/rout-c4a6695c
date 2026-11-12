import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Award, Link2, Loader2, QrCode, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/layout/AppLayout";
import { PhoneVerificationQueue } from "@/components/admin/PhoneVerificationQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  adminListShortLinks,
  adminUpdateShortLink,
  adminDeleteShortLink,
  adminScanSummary,
  adminPurgeScans,
  adminListBadges,
  adminGrantBadge,
  adminRevokeBadge,
} from "@/lib/admin-ops.functions";
import { i18n as trI18n } from "@/lib/i18n";

type ShortLink = {
  id: string;
  slug: string;
  label: string | null;
  targetUrl: string;
  isActive: boolean;
  scans: number;
  createdAt: string;
};

type BadgeRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  holders: number;
};

/** /admin/ops — corrective console for short links, badges and QR scans. */
export default function AdminOps() {
  const listLinks = useServerFn(adminListShortLinks);
  const updateLink = useServerFn(adminUpdateShortLink);
  const deleteLink = useServerFn(adminDeleteShortLink);
  const scanSummary = useServerFn(adminScanSummary);
  const purgeScans = useServerFn(adminPurgeScans);
  const listBadges = useServerFn(adminListBadges);
  const grantBadge = useServerFn(adminGrantBadge);
  const revokeBadge = useServerFn(adminRevokeBadge);

  const [search, setSearch] = useState("");
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [draft, setDraft] = useState<Record<string, { slug: string; targetUrl: string }>>({});
  const [summary, setSummary] = useState<Record<string, string>>({});

  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [badgeUserId, setBadgeUserId] = useState("");
  const [badgeSlug, setBadgeSlug] = useState("");

  const refresh = async (term = search) => {
    setLoading(true);
    try {
      const rows = (await listLinks({ data: { search: term, limit: 50 } })) as ShortLink[];
      setLinks(rows);
      setDraft(
        Object.fromEntries(rows.map((r) => [r.id, { slug: r.slug, targetUrl: r.targetUrl }])),
      );
    } catch (e) {
      if (String(e).includes("Forbidden")) setDenied(true);
      else toast.error(trI18n.t("ui.8178a20aed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh("");
    void (async () => {
      try {
        setBadges((await listBadges({})) as BadgeRow[]);
      } catch {
        /* handled by the links call */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (denied) {
    return (
      <AppLayout title="Beheer · Operations" crumbs={[{ label: "Operations" }]}>
        <p className="mt-6 text-sm text-muted-foreground">
          Je hebt geen beheerdersrechten voor deze console.
        </p>
      </AppLayout>
    );
  }

  const saveLink = async (row: ShortLink) => {
    const d = draft[row.id];
    if (!d) return;
    try {
      await updateLink({ data: { id: row.id, slug: d.slug, targetUrl: d.targetUrl } });
      toast.success(`/${d.slug} bijgewerkt`);
      void refresh();
    } catch (e) {
      toast.error(String(e).replace("Error: ", ""));
    }
  };

  const toggleLink = async (row: ShortLink) => {
    try {
      await updateLink({ data: { id: row.id, isActive: !row.isActive } });
      void refresh();
    } catch {
      toast.error(trI18n.t("ui.b1c84d0d9b"));
    }
  };

  const removeLink = async (row: ShortLink) => {
    if (!window.confirm(`/${row.slug} en alle scans definitief verwijderen?`)) return;
    try {
      await deleteLink({ data: { id: row.id } });
      toast.success(trI18n.t("ui.3f3ed9733b"));
      void refresh();
    } catch {
      toast.error(trI18n.t("ui.5998dee145"));
    }
  };

  const showScans = async (row: ShortLink) => {
    try {
      const s = (await scanSummary({ data: { trackedQrId: row.id } })) as {
        total: number;
        last7Days: number;
        lastScanAt: string | null;
      };
      setSummary((prev) => ({
        ...prev,
        [row.id]: `${s.total} scans · ${s.last7Days} laatste 7 dagen · laatst ${
          s.lastScanAt ? new Date(s.lastScanAt).toLocaleString() : "nooit"
        }`,
      }));
    } catch {
      toast.error(trI18n.t("ui.8510ebbca5"));
    }
  };

  const resetScans = async (row: ShortLink) => {
    if (!window.confirm(`Scanteller van /${row.slug} volledig wissen?`)) return;
    try {
      await purgeScans({ data: { trackedQrId: row.id, olderThanDays: null } });
      toast.success(trI18n.t("ui.80d4c068e2"));
      void refresh();
    } catch {
      toast.error(trI18n.t("ui.a41fd42990"));
    }
  };

  const doGrant = async (revoke: boolean) => {
    if (!badgeUserId || !badgeSlug) return toast.error(trI18n.t("ui.82ec788616"));
    try {
      const fn = revoke ? revokeBadge : grantBadge;
      await fn({ data: { userId: badgeUserId, badgeSlug } });
      toast.success(revoke ? "Badge ingetrokken" : "Badge toegekend");
      setBadges((await listBadges({})) as BadgeRow[]);
    } catch (e) {
      toast.error(String(e).replace("Error: ", ""));
    }
  };

  return (
    <AppLayout
      title="Beheer · Operations"
      description="Corrigeer short links, badges en scantellers."
      crumbs={[{ label: "Operations" }]}
    >
      <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Link2 className="h-4 w-4" /> Short links
        </h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void refresh();
          }}
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op slug, label of doel-URL"
            className="h-11 rounded-xl"
          />
          <Button type="submit" variant="outline" className="h-11 gap-1.5">
            <Search className="h-4 w-4" /> Zoek
          </Button>
        </form>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : links.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Geen short links gevonden.</p>
        ) : (
          <ul className="space-y-3">
            {links.map((row) => (
              <li key={row.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={row.isActive ? "default" : "outline"}>
                    {row.isActive ? "actief" : "uit"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{row.scans} scans</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr]">
                  <Input
                    value={draft[row.id]?.slug ?? row.slug}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        [row.id]: {
                          slug: e.target.value,
                          targetUrl: p[row.id]?.targetUrl ?? row.targetUrl,
                        },
                      }))
                    }
                    className="h-10 rounded-lg font-mono text-sm"
                    aria-label="slug"
                  />
                  <Input
                    value={draft[row.id]?.targetUrl ?? row.targetUrl}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        [row.id]: { slug: p[row.id]?.slug ?? row.slug, targetUrl: e.target.value },
                      }))
                    }
                    className="h-10 rounded-lg text-sm"
                    aria-label="doel-URL"
                  />
                </div>
                {summary[row.id] && (
                  <p className="mt-2 text-xs text-muted-foreground">{summary[row.id]}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void saveLink(row)} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" /> Bewaren
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void toggleLink(row)}>
                    {row.isActive ? "Deactiveren" : "Activeren"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void showScans(row)}
                  >
                    <QrCode className="h-3.5 w-3.5" /> Scans
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void resetScans(row)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Teller wissen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive"
                    onClick={() => void removeLink(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Verwijderen
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Award className="h-4 w-4" /> Badges
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {badges.map((b) => (
            <li key={b.id} className="rounded-xl border border-border bg-background p-3">
              <p className="text-sm font-medium">
                {b.name} <span className="font-mono text-xs text-muted-foreground">({b.slug})</span>
              </p>
              <p className="text-xs text-muted-foreground">{b.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">{b.holders} houders</p>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={badgeUserId}
            onChange={(e) => setBadgeUserId(e.target.value)}
            placeholder="Gebruikers-ID (uuid)"
            className="h-11 rounded-xl font-mono text-sm"
          />
          <Input
            value={badgeSlug}
            onChange={(e) => setBadgeSlug(e.target.value)}
            placeholder="badge-slug"
            className="h-11 rounded-xl font-mono text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void doGrant(false)} className="h-11">
            Badge toekennen
          </Button>
          <Button onClick={() => void doGrant(true)} variant="outline" className="h-11">
            Badge intrekken
          </Button>
        </div>
      </section>

      <PhoneVerificationQueue />
    </AppLayout>
  );
}
