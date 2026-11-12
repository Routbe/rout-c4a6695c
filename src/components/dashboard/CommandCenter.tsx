import { useEffect, useRef, useState, type ReactNode } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  GripVertical,
  Pencil,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Plus,
  SlidersHorizontal,
  AtSign,
  BarChart3,
  CalendarDays,
  Fingerprint,
  Inbox,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Mail,
  MessageCircleQuestion,
  Megaphone,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Radio,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { QaInbox } from "@/components/qa/QaInbox";
import { BrandLoader } from "@/components/BrandLoader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import { getCommandCenter, type ChronosEvent, type ChronosKind, type CommandCenterData } from "@/lib/command-center.functions";
import { useLocalFirst } from "@/lib/local-first/useLocalFirst";
import { useRelayStore } from "@/lib/local-first/useRelayStore";
import { plural } from "@/lib/plural";
import { getQuickPresence, setQuickPresence, type QuickPresence } from "@/lib/live-presence.functions";
import { PRESENCE_DEFS } from "@/lib/avatar-decorations";
import { PresenceComposer } from "@/components/qa/PresenceComposer";
import { ActivePulses } from "@/components/presence/ActivePulses";
import { SpatialChoice } from "@/components/ui/spatial-choice";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { DASHBOARD_WIDGETS, OPTIONAL_DASHBOARD_WIDGETS, normalizeDashboardLayout, moveDashboardWidgetTo, heightStep, widthStep, type DashboardLayout, type DashboardTile, type DashboardWidgetId } from "@/lib/dashboard-layout";
import { DashboardMusic, DashboardWeather, DashboardVisitors, UpcomingDashboardWidget } from "./ExternalDashboardWidgets";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { getCommandCenterPrefs, saveCommandCenterPrefs } from "@/lib/dashboard-widgets.functions";
import { i18n as trI18n } from "@/lib/i18n";
import { ShareWidget, CardWidget } from "./ShareCardWidgets";
import { useMyHandle } from "@/hooks/useMyHandle";

const KIND_ICON: Record<ChronosKind, typeof Inbox> = {
  notification: Inbox,
  contact: Mail,
  question: MessageCircleQuestion,
  guestbook: Megaphone,
  login: KeyRound,
  booking: CalendarDays,
  relay: ShieldCheck,
};

const EXAMPLE_EVENTS: ChronosEvent[] = [
  { id: "ex-1", kind: "contact", title: "Inkomend contactbericht via hub", detail: "Berichten via het contactblok op je hub verschijnen hier.", at: "" },
  { id: "ex-2", kind: "question", title: "Anonieme Q&A ontvangen", detail: "Vragen die bezoekers anoniem stellen.", at: "" },
  { id: "ex-3", kind: "login", title: "Login gedetecteerd bij app X", detail: "Elke “Login met ROUT” wordt hier gelogd.", at: "" },
  { id: "ex-4", kind: "guestbook", title: "Prikbord verzoek in de wachtrij", detail: "Nieuwe prikbordberichten wachten op je goedkeuring.", at: "" },
];

const rtf = new Intl.RelativeTimeFormat("nl-BE", { numeric: "auto" });
function relative(at: string): string {
  const diff = (new Date(at).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}


function Widget({
  to,
  icon: Icon,
  eyebrow,
  title,
  hint,
  className,
  children,
}: {
  to?: string;
  icon: typeof Inbox;
  eyebrow: string;
  title: ReactNode;
  hint?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const head = (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {eyebrow}
      </span>
      {to ? (
        <ArrowUpRight
          className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          aria-hidden
        />
      ) : null}
    </div>
  );
  const text = (
    <>
      <div className="mt-4 font-display text-2xl leading-tight text-foreground sm:text-[28px]">{title}</div>
      {hint ? <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p> : null}
    </>
  );
  const cls = cn(
    "acrylic-card group flex min-w-0 flex-col p-5 transition-colors",
    to && "hover:border-border-ink",
    className,
  );
  // Interactive children (switches, inputs) must never sit inside a link.
  if (to && !children) {
    return (
      <Link to={to} className={cls}>
        {head}
        {text}
      </Link>
    );
  }
  return (
    <section className={cls}>
      {to ? (
        <Link to={to} className="block">
          {head}
          {text}
        </Link>
      ) : (
        <>
          {head}
          {text}
        </>
      )}
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function normaliseUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** In-place QR: paste, generate, copy or download without leaving the cockpit. */
function QuickQr() {
  const [value, setValue] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const candidate = normaliseUrl(value);
  const download = () => {
    const canvas = document.getElementById("quick-qr-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "rout-qr.png";
    a.click();
  };
  const copy = async () => {
    const canvas = document.getElementById("quick-qr-canvas") as HTMLCanvasElement | null;
    try {
      if (canvas && "ClipboardItem" in window) {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
        if (blob) await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      } else if (url) {
        await navigator.clipboard.writeText(url);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(trI18n.t("ui.348c1acba6"));
    }
  };
  return (
    <div className="space-y-3">
      <form
        className="spatial-input flex items-center gap-2 rounded-lg p-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (candidate) setUrl(candidate);
        }}
      >
        <input
          data-tour="cc-qr-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…"
          inputMode="url"
          aria-label="URL voor een snelle QR-code"
          className="h-9 min-w-0 flex-1 bg-transparent px-2 font-mono text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon" className="size-9 shrink-0 rounded-full" disabled={!candidate} aria-label="QR maken" title="QR maken">
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
      {url ? (
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-white p-2">
            <QRCodeCanvas id="quick-qr-canvas" value={url} size={112} marginSize={1} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="truncate font-mono text-[11px] text-muted-foreground">{url}</p>
            <Button size="sm" variant="outline" className="h-8 justify-start gap-1.5" onClick={() => void copy()}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Gekopieerd" : "Kopiëren"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 justify-start gap-1.5" onClick={download}>
              <Download className="h-3.5 w-3.5" /> PNG
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RelayWidget({ userId, connectedApps }: { userId: string; connectedApps: number | null }) {
  const store = useRelayStore(userId);
  const relays = store.relays ?? [];
  const active = relays.filter((r) => r.status === "active").length;
  return (
    <Widget
      to="/dashboard/identity"
      icon={Fingerprint}
      eyebrow="Identity Relays"
      title={plural(active, "actieve relay", "actieve relays")}
      hint={
        active > 0
          ? `${plural(active, "app ziet", "apps zien")} alleen je ROUT-alias`
          : connectedApps
            ? `${plural(connectedApps, "gekoppelde app", "gekoppelde apps")} nog zonder relay`
            : "Apps zien alleen je ROUT-alias"
      }
      className="sm:col-span-2"
    >
      {store.relays === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Relays laden" />
      ) : !relays.length ? (
        <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          Nog geen relays. Schakel per gekoppelde app een privé-relay in via Identity.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {relays.slice(0, 4).map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.appName}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{r.proxyEmail}</span>
              </span>
              <Switch
                checked={r.status === "active"}
                onCheckedChange={() => void store.toggle(r)}
                aria-label={`Relay voor ${r.appName} ${r.status === "active" ? "pauzeren" : "hervatten"}`}
              />
            </li>
          ))}
        </ul>
      )}
      {store.pending > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> {plural(store.pending, "wijziging", "wijzigingen")} synchroniseren…
        </p>
      ) : null}
    </Widget>
  );
}

function ChronosStream({ events, syncing }: { events: ChronosEvent[]; syncing: boolean }) {
  const shown = events.length ? events : EXAMPLE_EVENTS;
  return (
    <aside
      className="acrylic-card min-w-0 p-5 font-mono lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
      aria-label="Chronos Stream"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
          </span>
          Chronos Stream · live
        </h2>
        {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Synchroniseren" /> : null}
      </div>
      {!events.length ? (
        <p className="mt-2 text-[11px] text-muted-foreground">&gt; nog geen gebeurtenissen — voorbeeld van je tijdlijn</p>
      ) : null}
      <ol className="mt-4 space-y-3 text-[12px]">
        {shown.map((ev) => {
          const Icon = KIND_ICON[ev.kind];
          return (
            <li key={ev.id} className="border-l border-border pl-3">
              <div className="flex items-baseline gap-2">
                <Icon className="h-3 w-3 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden />
                <p className="min-w-0 flex-1 text-foreground">{ev.title}</p>
                {ev.at ? (
                  <time dateTime={ev.at} className="shrink-0 text-[10px] text-muted-foreground">
                    {relative(ev.at)}
                  </time>
                ) : (
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px] font-normal">
                    voorbeeld
                  </Badge>
                )}
              </div>
              {ev.detail ? <p className="mt-0.5 line-clamp-2 pl-5 text-[11px] text-muted-foreground">{ev.detail}</p> : null}
            </li>
          );
        })}
      </ol>
      <Button asChild variant="outline" size="sm" className="mt-5 w-full gap-1.5 font-mono text-xs">
        <Link to="/my-data">
          <ShieldCheck className="h-3.5 w-3.5" /> Volledig audit-register
        </Link>
      </Button>
    </aside>
  );
}

function AgendaWidget({ c }: { c: CommandCenterData | null }) {
  const today = c?.todayBookings ?? [];
  return (
    <Widget
      icon={CalendarDays}
      eyebrow="Agenda & Boekingen"
      title={today.length ? `${plural(today.length, "afspraak", "afspraken")} vandaag` : "Vandaag vrij"}
      hint={
        c?.upcomingBookings
          ? `${plural(c.upcomingBookings, "aankomende afspraak", "aankomende afspraken")}${c.nextBookingAt ? ` · volgende ${new Date(c.nextBookingAt).toLocaleString("nl-BE", { dateStyle: "short", timeStyle: "short" })}` : ""}`
          : "Geen aankomende afspraken."
      }
    >
      {today.length ? (
        <ul className="mb-3 divide-y divide-border rounded-xl border border-border">
          {today.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">
                {new Date(b.at).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="truncate">{b.guest}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/agenda">
            <Plus className="h-4 w-4" /> Boeking
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/studio/booking">Beschikbaarheid</Link>
        </Button>
      </div>
    </Widget>
  );
}

/** Zero-state modules collapse into one compact status bar. */
function SystemPulse({ items }: { items: { label: string; to: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="acrylic-card flex flex-wrap items-center gap-2 px-3 py-2 font-mono text-[11px] text-muted-foreground sm:col-span-2 xl:col-span-3">
      <span className="uppercase tracking-[0.18em]">System pulse</span>
      {items.map((i) => (
        <Link key={i.label} to={i.to} className="rounded-full border border-border px-2 py-0.5 hover:border-border-ink hover:text-foreground">
          {i.label}
        </Link>
      ))}
    </div>
  );
}

/** Live Presence quick controls: Indicator, Bericht and Pulse — published instantly. */
function LivePresenceWidget({ userId }: { userId: string }) {
  const load = useServerFn(getQuickPresence);
  const save = useServerFn(setQuickPresence);
  const qc = useQueryClient();
  const key = ["quick-presence", userId];
  const q = useQuery({ queryKey: key, queryFn: () => load() });
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const apply = async (patch: Partial<QuickPresence>) => {
    if (!d) return;
    setBusy(true);
    try {
      const next = await save({ data: { presence: d.presence, statusLine: d.statusLine, pulseRing: d.pulseRing, ...patch } });
      qc.setQueryData(key, { ...d, ...next });
      setLine(null);
      toast.success(trI18n.t("ui.3073ecb29a"));
    } catch {
      toast.error(trI18n.t("ui.48dfc582a4"));
    } finally {
      setBusy(false);
    }
  };
  const value = line ?? d?.statusLine ?? "";
  return (
    <Widget icon={Radio} eyebrow="Live Presence" title="Je status" hint="Wijzigingen staan meteen live op je profiel.">
      {!d ? (
        <Loader2 className="mt-4 h-4 w-4 animate-spin text-muted-foreground" aria-label="Laden" />
      ) : (
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Indicator</p>
            <SpatialChoice label="Indicator" value={d.presence} disabled={busy} onChange={(presence) => void apply({ presence })}
              options={PRESENCE_DEFS.map((p) => ({ value: p.id, label: <><span aria-hidden className="h-2 w-2 shrink-0 rounded-full border border-border" style={{ background: p.color }} />{p.label}</> }))}
              className="flex-wrap [&>button]:basis-auto" />
          </div>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void apply({ statusLine: value }); }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Bericht</p>
            <div className="flex gap-2">
              <Input aria-label="Statusbericht" value={value} maxLength={60} placeholder="Bijv. Bored" onChange={(e) => setLine(e.target.value)} className="h-9 text-sm" />
              <Button type="submit" size="sm" disabled={busy || line === null}>Opslaan</Button>
            </div>
          </form>
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pulse</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Toon Pulse-ring om avatar</span>
              <Switch aria-label="Toon Pulse-ring om avatar" checked={d.pulseRing} disabled={busy} onCheckedChange={(v) => void apply({ pulseRing: v })} />
            </div>
            {d.handle ? <PresenceComposer owner={userId} handle={d.handle} space="root" blocks={[]} variant="default" /> : null}
            <ActivePulses handle={d.handle ?? null} />
          </div>
        </div>
      )}
    </Widget>
  );
}

type WidgetId = DashboardWidgetId;
const WIDGET_LABEL: Record<WidgetId, string> = {
  share: "Delen",
  card: "ROUT-kaart",
  presence: "Live Presence",
  relays: "Identity Relays",
  hub: "Profiel Hub",
  qr: "Snelle QR",
  inbox: "Unified Inbox",
  agenda: "Agenda",
  social: "Social & Prikbord",
  qa: "Anonieme Inbox",
  connections: "Gekoppelde apps",
  visitors: "Bezoekers", spotify: "Spotify", weather: "Weer", smarthome: "Smarthome", fitness: "Fitness", smart: "Smart widgets",
};

/** Board layout: saved on the ROUT profile (follows you across devices), cached locally for instant paint. */
function useDashboardLayout(userId: string | undefined) {
  const key = userId ? `rout:dashboard-hidden:${userId}` : null;
  const loadPrefs = useServerFn(getCommandCenterPrefs);
  const savePrefs = useServerFn(saveCommandCenterPrefs);
  const prefs = useQuery({ queryKey: ["cc-prefs", userId], enabled: !!userId, queryFn: () => loadPrefs(), staleTime: 60_000 });
  const [board, setBoard] = useState<DashboardLayout>(() => normalizeDashboardLayout({ hidden: [...OPTIONAL_DASHBOARD_WIDGETS] }));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!key) return;
    try {
      const raw = window.localStorage.getItem(key);
      const next = window.localStorage.getItem(`${key}:layout`);
      setBoard(normalizeDashboardLayout(next ? JSON.parse(next) : { hidden: raw ? [...JSON.parse(raw), ...OPTIONAL_DASHBOARD_WIDGETS] : [...OPTIONAL_DASHBOARD_WIDGETS] }));
    } catch {
      /* ignore corrupt layout */
    }
  }, [key]);
  useEffect(() => {
    if (prefs.data?.layout) setBoard(normalizeDashboardLayout(prefs.data.layout));
  }, [prefs.data?.layout]);
  const update = (change: (previous: DashboardLayout) => DashboardLayout) =>
    setBoard((prev) => {
      const next = normalizeDashboardLayout(change(prev));
      if (key) try { window.localStorage.setItem(`${key}:layout`, JSON.stringify(next)); } catch { /* unavailable device storage must not block editing */ }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void savePrefs({ data: { layout: next } }).catch(() => toast.error("Indeling niet opgeslagen op je profiel.")); }, 600);
      return next;
    });
  const toggle = (id: WidgetId) => update(prev => ({ ...prev, hidden: prev.hidden.includes(id) ? prev.hidden.filter(x => x !== id) : [...prev.hidden, id] }));
  const moveTo = (id: WidgetId, target: WidgetId) => update(prev => moveDashboardWidgetTo(prev, id, target));
  const resize = (id: WidgetId, patch: Partial<DashboardTile>) => update(prev => {
    const cur = prev.tiles[id] ?? { width: 1, height: "auto" };
    if ((patch.width ?? cur.width) === cur.width && (patch.height ?? cur.height) === cur.height) return prev;
    return { ...prev, tiles: { ...prev.tiles, [id]: { ...cur, ...patch } } };
  });
  const reset = () => update(() => normalizeDashboardLayout({ hidden: [...OPTIONAL_DASHBOARD_WIDGETS] }));
  return {
    ...board, toggle, moveTo, resize, reset,
    weatherCity: prefs.data?.weatherCity ?? null,
    weatherSource: prefs.data?.weatherCitySource ?? "none",
    ownWeatherCity: prefs.data?.ownWeatherCity ?? null,
  };
}

const TILE_WIDTH = { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-2 xl:col-span-3" } as const;
const TILE_HEIGHT = { auto: "", medium: "min-h-72", tall: "min-h-96", xl: "min-h-[32rem]" } as const;

function gridMetrics(el: HTMLElement) {
  const grid = el.closest<HTMLElement>("[data-cc-grid]");
  const cs = grid ? getComputedStyle(grid) : null;
  const cols = cs ? cs.gridTemplateColumns.split(" ").filter(Boolean) : ["300px"];
  return { columns: cols.length, columnPx: parseFloat(cols[0] ?? "300"), gapPx: cs ? parseFloat(cs.columnGap) || 16 : 16 };
}

function Slot({ id, editing, hidden, onToggle, order, tile, onMoveTo, onResize, onConfigure, dragging, onDragState, className, children }: {
  id: WidgetId; editing: boolean; hidden: boolean; onToggle: (id: WidgetId) => void; order: number; tile?: DashboardTile;
  onMoveTo: (id: WidgetId, target: WidgetId) => void; onResize: (id: WidgetId, patch: Partial<DashboardTile>) => void;
  onConfigure?: (id: WidgetId) => void; dragging: WidgetId | null; onDragState: (id: WidgetId | null) => void; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  if (hidden && !editing) return null;

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onDragState(id);
  };
  const moveDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (dragging !== id) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-cc-slot]");
    const target = over?.dataset["ccSlot"] as WidgetId | undefined;
    if (target && target !== id) onMoveTo(id, target);
  };
  const endDrag = () => onDragState(null);

  const startResize = (axis: "x" | "y" | "xy") => (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const m = gridMetrics(el);
    const sx = e.clientX, sy = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const patch: Partial<DashboardTile> = {};
      if (axis !== "y") patch.width = widthStep(rect.width + ev.clientX - sx, m.columnPx, m.gapPx, m.columns);
      if (axis !== "x") patch.height = heightStep(rect.height + ev.clientY - sy);
      onResize(id, patch);
    };
    const onUp = () => { handle.removeEventListener("pointermove", onMove); handle.removeEventListener("pointerup", onUp); handle.removeEventListener("pointercancel", onUp); };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const label = WIDGET_LABEL[id];
  return (
    <div
      ref={ref}
      data-tour={`cc-${id}`}
      data-cc-slot={id}
      style={{ order }}
      className={cn(
        "relative min-w-0 flex flex-col transition-[box-shadow,transform,opacity] duration-150",
        editing && "rounded-xl ring-1 ring-border",
        dragging === id && "z-20 scale-[1.02] opacity-90 shadow-2xl ring-2 ring-primary",
        dragging && dragging !== id && "ring-dashed",
        hidden && "opacity-40",
        tile ? TILE_WIDTH[tile.width] : className,
        tile && TILE_HEIGHT[tile.height],
      )}
    >
      {editing ? (
        <div className="flex items-center gap-1 p-2">
          <button
            type="button"
            className="flex h-7 cursor-grab touch-none items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted active:cursor-grabbing"
            aria-label={`${label} verslepen`}
            title="Sleep om te verplaatsen"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <GripVertical className="size-4" /> {label}
          </button>
          <Button size="sm" variant="secondary" className="ml-auto h-7 gap-1 text-xs" onClick={() => onToggle(id)} aria-label={`${label} ${hidden ? "tonen" : "verbergen"}`}>
            {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {hidden ? "Tonen" : "Verbergen"}
          </Button>
        </div>
      ) : null}
      <div className={cn("flex min-w-0 flex-1 flex-col [&>*]:flex-1", editing && "pointer-events-none select-none")}>{!hidden && children}</div>
      {editing && !hidden && onConfigure ? (
        <Button
          type="button"
          size="icon"
          className="absolute left-1/2 top-1/2 z-10 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg"
          aria-label={`${label} instellen`}
          title={`${label} instellen`}
          onClick={() => onConfigure(id)}
        >
          <Pencil className="size-5" />
        </Button>
      ) : null}
      {editing && !hidden ? (
        <>
          <span role="separator" aria-label={`${label} breder of smaller slepen`} onPointerDown={startResize("x")} className="absolute -right-1.5 top-10 bottom-4 z-10 w-3 cursor-ew-resize touch-none rounded-full hover:bg-primary/30" />
          <span role="separator" aria-label={`${label} hoger of lager slepen`} onPointerDown={startResize("y")} className="absolute -bottom-1.5 left-4 right-4 z-10 h-3 cursor-ns-resize touch-none rounded-full hover:bg-primary/30" />
          <span aria-label={`${label} vergroten`} onPointerDown={startResize("xy")} className="absolute -bottom-1 -right-1 z-10 size-5 cursor-nwse-resize touch-none rounded-br-xl border-b-2 border-r-2 border-primary" />
        </>
      ) : null}
    </div>
  );
}

function WeatherLocationDialog({ open, current, profileCity, onClose, userId }: { open: boolean; current: string | null; profileCity: string | null; onClose: () => void; userId: string }) {
  const save = useServerFn(saveCommandCenterPrefs);
  const qc = useQueryClient();
  const [city, setCity] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setCity(current ?? ""); }, [open, current]);
  const valid = city.trim().length >= 2;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Locatie voor het weer</DialogTitle>
          <DialogDescription>Standaard gebruikt het dashboard de stad van je profiel (locatie of weer-, klok- of kaartwidget). Vul hier enkel iets in als je dashboard een andere stad moet tonen.</DialogDescription>
        </DialogHeader>
        <form id="weather-loc" onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          try {
            await save({ data: { weatherCity: city.trim() } });
            await qc.invalidateQueries({ queryKey: ["cc-prefs", userId] });
            toast.success("Locatie bewaard.");
            onClose();
          } catch {
            toast.error("Locatie niet bewaard. Gebruik enkel letters, cijfers en leestekens.");
          } finally { setBusy(false); }
        }}>
          <Input autoFocus aria-label="Stad" placeholder={profileCity ? `Nu: ${profileCity} (van je profiel)` : "Bijv. Gent"} value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} />
        </form>
        <DialogFooter>
          {current ? <Button variant="outline" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await save({ data: { weatherCity: null } });
              await qc.invalidateQueries({ queryKey: ["cc-prefs", userId] });
              toast.success("Het dashboard volgt nu je profiellocatie.");
              onClose();
            } catch { toast.error("Niet bewaard. Probeer opnieuw."); } finally { setBusy(false); }
          }}>Profiellocatie gebruiken</Button> : null}
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button type="submit" form="weather-loc" disabled={!valid || busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Bewaren</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * /dashboard — the Command Center cockpit. Left: bento control grid; right:
 * the Chronos event stream. State is local-first: the last snapshot paints
 * instantly from IndexedDB, mutations apply at 0 ms and sync in the background.
 * QR statistics live in /dashboard/assets.
 */
export function CommandCenter() {
  const { user } = useAuth();
  const loadCenter = useServerFn(getCommandCenter);
  const state = useLocalFirst<CommandCenterData>(user ? `cockpit:${user.id}` : null, () => loadCenter());
  const [isEditingDashboard, setIsEditingDashboard] = useState(false);
  const layout = useDashboardLayout(user?.id);
  const myHandle = useMyHandle();
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const [configuring, setConfiguring] = useState<WidgetId | null>(null);

  if (!user || (!state.data && state.syncing)) {
    return (
      <AppLayout title="Command Center" width="wide">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="relative h-24 w-24">
            <BrandLoader label="Cockpit laden…" />
          </div>
        </div>
      </AppLayout>
    );
  }

  const c = state.data;
  const inboxCount = c ? (c.unreadNotifications ?? 0) + (c.openQuestions ?? 0) : null;
  const showRelays = (c?.activeRelays ?? 0) > 0;
  const pulse = [
    ...(!showRelays ? [{ label: `Relays: ${c?.activeRelays ?? 0}`, to: "/dashboard/identity" }] : []),
    ...(!inboxCount ? [{ label: "Inbox: 0", to: "/dashboard/assets" }] : []),
    ...(!c?.guestbook30d ? [{ label: "Prikbord: 0", to: "/dashboard/bluesky" }] : []),
    ...(!c?.upcomingBookings ? [{ label: "Agenda: 0", to: "/agenda" }] : []),
  ];
  const configurable: Partial<Record<WidgetId, (id: WidgetId) => void>> = {
    weather: () => setConfiguring("weather"),
    spotify: () => { window.location.href = "/studio"; },
    hub: () => { window.location.href = "/studio"; },
  };
  const slot = (id: WidgetId) => ({ editing: isEditingDashboard, hidden: layout.hidden.includes(id), onToggle: layout.toggle, order: layout.order.indexOf(id), tile: layout.tiles[id], onMoveTo: layout.moveTo, onResize: layout.resize, onConfigure: configurable[id], dragging, onDragState: setDragging });

  return (
    <AppLayout
      title="Command Center"
      description="Je soevereine cockpit voor identiteit, communicatie en routing."
      width="wide"
      crumbs={[{ label: "Command Center" }]}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button data-tour="cc-customize" size="sm" variant={isEditingDashboard ? "secondary" : "ghost"} className="gap-1.5" onClick={() => setIsEditingDashboard((v) => !v)} aria-pressed={isEditingDashboard}>
            <SlidersHorizontal className="h-4 w-4" /> {isEditingDashboard ? "Klaar" : "Aanpassen"}
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void state.refresh()} disabled={state.syncing}>
            <RefreshCw className={cn("h-4 w-4", state.syncing && "animate-spin")} /> Sync
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/dashboard/assets">
              <BarChart3 className="h-4 w-4" /> Assets &amp; statistieken
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5" data-tour="cc-studio">
            <Link to="/studio">
              <LayoutTemplate className="h-4 w-4" /> Studio
            </Link>
          </Button>
        </div>
      }
    >
      {state.error && !c ? (
        <p className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          De cockpit kon niet synchroniseren. Probeer opnieuw met Sync.
        </p>
      ) : null}
      {isEditingDashboard && <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border pb-4">
        {DASHBOARD_WIDGETS.map(id => <Button key={id} variant={layout.hidden.includes(id) ? "outline" : "secondary"} size="sm" aria-pressed={!layout.hidden.includes(id)} onClick={() => layout.toggle(id)}><Plus className="size-3.5" />{WIDGET_LABEL[id]}</Button>)}
        <Button variant="ghost" size="sm" onClick={layout.reset}>Indeling herstellen</Button>
      </div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div data-cc-grid className="grid auto-rows-min gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SystemPulse items={pulse} />

          {showRelays || isEditingDashboard ? (
            <Slot id="relays" className="sm:col-span-2" {...slot("relays")}>
              <RelayWidget userId={user.id} connectedApps={c?.connectedApps ?? null} />
            </Slot>
          ) : null}

          <Slot id="share" className="sm:col-span-2" {...slot("share")}>
            <ShareWidget handle={myHandle} />
          </Slot>
          <Slot id="card" {...slot("card")}>
            <CardWidget handle={myHandle} />
          </Slot>

          <Slot id="presence" className="sm:col-span-2" {...slot("presence")}>
            <LivePresenceWidget userId={user.id} />
          </Slot>

          <Slot id="qr" className="sm:row-span-2" {...slot("qr")}>
            <Widget icon={QrCode} eyebrow="Snelle QR" title="Plak een link" hint="QR maken, kopiëren of downloaden — hier ter plaatse.">
              <QuickQr />
            </Widget>
          </Slot>

          <Slot id="agenda" className="sm:col-span-2 xl:col-span-1" {...slot("agenda")}>
            <AgendaWidget c={c} />
          </Slot>

          {inboxCount || isEditingDashboard ? (
            <Slot id="inbox" {...slot("inbox")}>
              <Widget
                to="/dashboard/assets"
                icon={Inbox}
                eyebrow="Unified Inbox"
                title={plural(inboxCount ?? 0, "nieuw bericht", "nieuwe berichten")}
                hint={`${plural(c?.unreadNotifications ?? 0, "melding", "meldingen")} · ${plural(c?.openQuestions ?? 0, "open vraag", "open vragen")}`}
              />
            </Slot>
          ) : null}

          {c?.guestbook30d || isEditingDashboard ? (
            <Slot id="social" {...slot("social")}>
              <Widget
                to="/dashboard/bluesky"
                icon={AtSign}
                eyebrow="Social & Prikbord"
                title={plural(c?.guestbook30d ?? 0, "prikbord-bericht", "prikbord-berichten")}
                hint="Laatste 30 dagen · beheer je Mastodon/Bluesky feed op je hub."
              />
            </Slot>
          ) : null}

          {c?.openQuestions || isEditingDashboard ? (
            <Slot id="qa" className="sm:col-span-2" {...slot("qa")}>
              <Widget icon={MessageCircleQuestion} eyebrow="Anonieme Inbox" title={plural(c?.openQuestions ?? 0, "open bericht", "open berichten")} hint="Beantwoorden, delen als story of de afzender onzichtbaar dempen.">
                <QaInbox space={null} limit={3} compact />
              </Widget>
            </Slot>
          ) : null}

          <Slot id="hub" {...slot("hub")}>
            <Widget to="/studio" icon={LayoutTemplate} eyebrow="Profiel Hub" title="Hub beheren" hint="Blokken, thema en zichtbaarheid in de Studio." />
          </Slot>
          <Slot id="connections" {...slot("connections")}><Widget to="/dashboard/identity" icon={Fingerprint} eyebrow="Gekoppelde apps" title={c?.connectedApps === null || c?.connectedApps === undefined ? "—" : plural(c.connectedApps, "app", "apps")} hint="Actieve toestemmingen voor je identiteit." /></Slot>
          <Slot id="visitors" {...slot("visitors")}><DashboardVisitors userId={user.id} /></Slot>
          <Slot id="spotify" {...slot("spotify")}><DashboardMusic userId={user.id} /></Slot>
          <Slot id="weather" {...slot("weather")}><DashboardWeather city={layout.weatherCity} source={layout.weatherSource} /></Slot>
          {(["smarthome", "fitness", "smart"] as const).map(id => <Slot key={id} id={id} {...slot(id)}><UpcomingDashboardWidget title={WIDGET_LABEL[id]} /></Slot>)}
        </div>

        <ChronosStream events={c?.events ?? []} syncing={state.syncing} />
      </div>
      {state.savedAt ? (
        <p className="mt-4 text-right text-[11px] text-muted-foreground">
          Lokaal gesynchroniseerd {relative(new Date(state.savedAt).toISOString())}
        </p>
      ) : null}
      <WeatherLocationDialog open={configuring === "weather"} current={layout.ownWeatherCity} profileCity={layout.weatherSource === "widget" || layout.weatherSource === "profile" ? layout.weatherCity : null} userId={user.id} onClose={() => setConfiguring(null)} />
    </AppLayout>
  );
}
