import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { db } from "@/lib/db/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Trash2,
  BarChart3,
  Search,
  MoreHorizontal,
  Copy,
  Link2,
  Pencil,
  QrCode,
  Wifi,
  Contact,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { updateShortLinkTarget } from "@/lib/short-link-edit.functions";
import { formatDateTime } from "@/lib/format";
import { i18n as trI18n } from "@/lib/i18n";

interface SavedQR {
  id: string;
  name: string;
  qr_type: string;
  qr_value: string;
  created_at: string;
}
interface TrackedRow {
  id: string;
  slug: string;
  dashboard_token: string;
  label: string | null;
  target_url: string;
  target_type: string;
  created_at: string;
  updated_at?: string | null;
  scan_count?: number;
}

type Item = {
  id: string;
  kind: "static" | "tracked";
  title: string;
  subtitle: string;
  type: string;
  created_at: string;
  scans: number;
  statsTo?: string;
  shortUrl?: string;
  targetUrl?: string;
  updatedAt?: string | null;
};

type TabKey = "all" | "tracked" | "static" | "archived";
type SortKey = "newest" | "scans" | "alpha";

const QUICK_ACTIONS = [
  { icon: Link2, title: "Link QR", body: "Send the scanner to a URL.", to: "/" },
  { icon: Wifi, title: "Wi-Fi QR", body: "Let people connect to Wi-Fi instantly.", to: "/" },
  { icon: Contact, title: "vCard QR", body: "Share contact details digitally.", to: "/" },
  {
    icon: FileSpreadsheet,
    title: "Batch QR",
    body: "Generate multiple QR codes via CSV.",
    to: "/batch",
  },
];

/** Unified QR management card: tabs, search, sort and per-item actions. */
export function QrsPanel() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<SavedQR[]>([]);
  const [tracked, setTracked] = useState<TrackedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: s }, { data: t }] = await Promise.all([
        db.from("saved_qrs").select("*").order("created_at", { ascending: false }),
        db
          .from("tracked_qrs")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      const trackedRows = (t ?? []) as TrackedRow[];
      if (trackedRows.length) {
        const ids = trackedRows.map((r) => r.id);
        const { data: scans } = await db
          .from("qr_scans")
          .select("tracked_qr_id")
          .in("tracked_qr_id", ids);
        const counts = new Map<string, number>();
        for (const row of scans ?? [])
          counts.set(row.tracked_qr_id, (counts.get(row.tracked_qr_id) ?? 0) + 1);
        trackedRows.forEach((r) => (r.scan_count = counts.get(r.id) ?? 0));
      }
      setSaved((s ?? []) as SavedQR[]);
      setTracked(trackedRows);
      setLoading(false);
    })();
  }, [user]);

  const items = useMemo<Item[]>(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const list: Item[] = [
      ...tracked.map((t) => ({
        id: t.id,
        kind: "tracked" as const,
        title: t.label || t.target_url,
        subtitle: t.target_url,
        type: t.target_type,
        created_at: t.created_at,
        scans: t.scan_count ?? 0,
        statsTo: `/stats/${t.dashboard_token}`,
        targetUrl: t.target_url,
        updatedAt: t.updated_at ?? t.created_at,
        shortUrl: `${origin}/s/${t.slug}`,
      })),
      ...saved.map((s) => ({
        id: s.id,
        kind: "static" as const,
        title: s.name,
        subtitle: s.qr_value,
        type: s.qr_type,
        created_at: s.created_at,
        scans: 0,
      })),
    ];

    const q = query.trim().toLowerCase();
    const filtered = list
      .filter((i) => (tab === "all" ? true : tab === "archived" ? false : i.kind === tab))
      .filter(
        (i) => !q || i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q),
      );

    // `created_at` kan een string, Date of null zijn (afhankelijk van de bron),
    // dus altijd normaliseren naar een timestamp voordat we sorteren.
    const time = (value: unknown) => {
      if (value instanceof Date) return value.getTime();
      const parsed = value ? new Date(String(value)).getTime() : NaN;
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    return filtered.sort((a, b) => {
      if (sort === "scans") return b.scans - a.scans;
      if (sort === "alpha") return String(a.title).localeCompare(String(b.title));
      return time(b.created_at) - time(a.created_at);
    });
  }, [saved, tracked, tab, query, sort]);

  // Bewerk bestemming: de short link / QR blijft ongewijzigd, alleen de
  // doel-URL waarnaar hij doorstuurt wordt bijgewerkt.
  const [editing, setEditing] = useState<Item | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

  const openEdit = (item: Item) => {
    setEditing(item);
    setEditUrl(item.targetUrl ?? "");
  };

  const saveTarget = async () => {
    if (!editing) return;
    const url = editUrl.trim();
    if (!/^https:\/\/\S+$/i.test(url)) {
      toast.error(trI18n.t("ui.34b44e104b"));
      return;
    }
    setSavingUrl(true);
    try {
      const result = await updateShortLinkTarget({ data: { id: editing.id, targetUrl: url } });
      setTracked((rows) =>
        rows.map((r) =>
          r.id === editing.id ? { ...r, target_url: url, updated_at: result.updated_at } : r,
        ),
      );
      toast.success(trI18n.t("ui.9a0f45cb5c"));
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bijwerken is niet gelukt.");
    } finally {
      setSavingUrl(false);
    }
  };

  const del = async (item: Item) => {
    if (!confirm("Delete this QR?")) return;
    const table = item.kind === "static" ? "saved_qrs" : "tracked_qrs";
    const { error } = await db.from(table).delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    if (item.kind === "static") setSaved((rows) => rows.filter((r) => r.id !== item.id));
    else setTracked((rows) => rows.filter((r) => r.id !== item.id));
    toast.success(trI18n.t("ui.441bda6cd8"));
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const empty = saved.length === 0 && tracked.length === 0;

  if (empty) {
    return (
      <section className="rounded-2xl border border-border bg-card p-3.5 sm:p-6">
        <h2 className="text-lg font-medium">Create your first QR code</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a starting point — you can always adjust later.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {QUICK_ACTIONS.map(({ icon: Icon, title, body, to }) => (
            <Link
              key={title}
              to={to}
              className="flex items-start gap-3 rounded-2xl border border-border bg-background p-4 transition-colors hover:bg-muted/50"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-3.5 sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <h2 className="truncate text-lg font-medium">QR management</h2>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to="/">
            <QrCode className="mr-1 h-4 w-4" /> New
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mt-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="all">All QRs</TabsTrigger>
          <TabsTrigger value="tracked">Dynamic</TabsTrigger>
          <TabsTrigger value="static">Static</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or URL"
            className="pl-9"
            aria-label="Search QR codes"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newste</SelectItem>
            <SelectItem value="scans">Most scans</SelectItem>
            <SelectItem value="alpha">Alphabetical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {tab === "archived" ? "No archived QR codes." : "Nothing found for this filter."}
          </p>
        ) : (
          items.map((item) => (
            <div
              key={`${item.kind}-${item.id}`}
              className="flex items-start gap-3 rounded-2xl border border-border bg-background p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                    {item.kind === "tracked" ? "dynamic" : item.type}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.subtitle}</p>
                {item.kind === "tracked" ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs">
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                    <span className="font-medium">{item.scans}</span>
                    <span className="text-muted-foreground">scans</span>
                  </p>
                ) : null}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card">
                  {item.shortUrl ? (
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => {
                        void navigator.clipboard.writeText(item.shortUrl!);
                        toast.success(trI18n.t("ui.20a78719da"));
                      }}
                    >
                      <Copy className="h-4 w-4" /> Copy short link
                    </DropdownMenuItem>
                  ) : null}
                  {item.kind === "tracked" ? (
                    <DropdownMenuItem className="gap-2" onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" /> Bewerk bestemming
                    </DropdownMenuItem>
                  ) : null}
                  {item.statsTo ? (
                    <DropdownMenuItem asChild className="gap-2">
                      <Link to={item.statsTo}>
                        <BarChart3 className="h-4 w-4" /> Analytics & destination
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem asChild className="gap-2">
                    <Link to="/">
                      <QrCode className="h-4 w-4" /> Download SVG / PNG
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 text-destructive" onClick={() => del(item)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bestemming bewerken</DialogTitle>
            <DialogDescription>
              De QR-code en short link blijven exact hetzelfde — alleen de pagina waarnaar ze
              doorsturen verandert.
            </DialogDescription>
          </DialogHeader>
          {editing?.shortUrl ? (
            <p className="truncate rounded-xl border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              {editing.shortUrl}
            </p>
          ) : null}
          {editing?.updatedAt ? (
            <p className="text-xs text-muted-foreground">
              Laatst bijgewerkt: {formatDateTime(editing.updatedAt, "nl")}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="qr-target-url" className="text-xs font-semibold">
              Doel-URL
            </Label>
            <Input
              id="qr-target-url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder="https://voorbeeld.be/pagina"
              inputMode="url"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Annuleren
            </Button>
            <Button onClick={() => void saveTarget()} disabled={savingUrl}>
              {savingUrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
