import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUp, CalendarClock, Check, Copy, Link2, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import {
  actOnBooking, addBookingCalendar, getBookingStudio, removeBookingCalendar, saveAvailabilityRules,
  saveBookingEventType, setBookingEventTypeActive, syncBookingCalendar, addAvailabilityException, removeAvailabilityException,
} from "@/lib/booking-engine/booking.functions";
import type { IntakeField } from "@/lib/booking-engine/intake";

type Studio = Extract<Awaited<ReturnType<typeof getBookingStudio>>, { ready: true }>;
type EventType = Studio["eventTypes"][number];

const QK = ["booking-studio"];

function useStudio() {
  const fn = useServerFn(getBookingStudio);
  return useQuery({ queryKey: QK, queryFn: () => fn() });
}

function relative(iso: string | null, locale: string) {
  if (!iso) return null;
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diff) < 60) return rtf.format(diff, "minute");
  if (Math.abs(diff) < 1440) return rtf.format(Math.round(diff / 60), "hour");
  return rtf.format(Math.round(diff / 1440), "day");
}

import { PrivacyBadge } from "@/components/PrivacyBadge";
import { i18n as trI18n } from "@/lib/i18n";

/** Booking management, rendered inside the Studio page switcher (Inhoud | Vormgeving | Statistieken). */
export function BookingStudioPanel() {
  const { t } = useI18n();
  const q = useStudio();
  if (q.isLoading || !q.data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!q.data.ready) return <p className="py-10 text-center text-sm text-muted-foreground">{t("booking.err.generic")}</p>;
  const data = q.data;
  const confirmed = data.bookings.filter((b) => b.status === "confirmed").length;
  const requested = data.bookings.filter((b) => b.status === "requested").length;
  return (
    <Tabs defaultValue="content" className="space-y-5">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="content">Inhoud</TabsTrigger>
        <TabsTrigger value="design">Vormgeving</TabsTrigger>
        <TabsTrigger value="stats">Statistieken</TabsTrigger>
      </TabsList>
      <TabsContent value="content">
        <Tabs defaultValue="requests" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
              <TabsTrigger value="requests">{t("booking.tab.requests")}</TabsTrigger>
              <TabsTrigger value="types">{t("booking.tab.types")}</TabsTrigger>
              <TabsTrigger value="availability">{t("booking.tab.availability")}</TabsTrigger>
              <TabsTrigger value="calendars">{t("booking.tab.calendars")}</TabsTrigger>
            </TabsList>
            <PrivacyBadge kind="zk-pii" />
          </div>
          <TabsContent value="requests"><Requests data={data} /></TabsContent>
          <TabsContent value="types"><Types data={data} /></TabsContent>
          <TabsContent value="availability"><Availability data={data} /></TabsContent>
          <TabsContent value="calendars"><Calendars data={data} /></TabsContent>
        </Tabs>
      </TabsContent>
      <TabsContent value="design">
        <Panel><p className="text-sm text-muted-foreground">Je boekingspagina neemt het thema, de achtergrond en de knopstijl van je hoofdprofiel over, zodat bezoekers één herkenbare stijl zien. Pas die aan via Vormgeving op je hoofdprofiel.</p></Panel>
      </TabsContent>
      <TabsContent value="stats">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Boekingstypes", data.eventTypes.length],
            ["Aanvragen", requested],
            ["Bevestigd", confirmed],
            ["Totaal", data.bookings.length],
          ].map(([label, n]) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{n}</p>
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">{children}</section>;
}

// ---------- requests ----------

function Requests({ data }: { data: Studio }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const act = useServerFn(actOnBooking);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, action: "confirm" | "decline" | "cancel") => {
    setBusy(id);
    const r = await act({ data: { id, action } }).catch(() => ({ ok: false }));
    setBusy(null);
    if (r.ok) toast.success(t("booking.action.done"));
    else toast.error(t("booking.err.generic"));
    await qc.invalidateQueries({ queryKey: QK });
  };
  if (data.bookings.length === 0) return <Panel><p className="text-sm text-muted-foreground">{t("booking.empty.requests")}</p></Panel>;
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="space-y-3">
      {data.bookings.map((b) => (
        <Panel key={b.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{b.title}</span>
                <Badge variant={b.status === "requested" ? "default" : "secondary"}>{t(`booking.status.${b.status}`)}</Badge>
              </div>
              <p className="text-sm text-foreground">{fmt.format(new Date(b.startUtc))}</p>
              <p className="truncate text-sm text-muted-foreground">{b.guestName} · {b.guestEmail} · {b.guestTimezone}</p>
              {b.guestNote && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{b.guestNote}</p>}
              {b.intake.length > 0 && (
                <dl className="mt-2 grid gap-1 rounded-lg border border-border bg-background p-2 text-sm">
                  {b.intake.map((a) => (
                    <div key={a.label} className="flex flex-wrap gap-x-2"><dt className="font-medium">{a.label}:</dt><dd className="whitespace-pre-wrap text-muted-foreground">{a.value}</dd></div>
                  ))}
                </dl>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {b.status === "requested" && (
                <>
                  <Button size="sm" disabled={busy === b.id} onClick={() => run(b.id, "confirm")}><Check className="h-4 w-4" />{t("booking.action.confirm")}</Button>
                  <Button size="sm" variant="soft" disabled={busy === b.id} onClick={() => run(b.id, "decline")}><X className="h-4 w-4" />{t("booking.action.decline")}</Button>
                </>
              )}
              {b.status === "confirmed" && (
                <Button size="sm" variant="soft" disabled={busy === b.id} onClick={() => run(b.id, "cancel")}>{t("booking.action.cancel")}</Button>
              )}
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

// ---------- event types ----------

type Draft = {
  id: string | null; workspace: boolean; title: string; slug: string; durationMinutes: number; bufferBeforeMinutes: number;
  bufferAfterMinutes: number; minimumNoticeHours: number; maxDaysAhead: number; confirmationMode: "instant" | "request";
  price: string; locationKind: "video" | "address" | "phone"; locationValue: string;
  routingStrategy: "STRICT" | "ROUND_ROBIN" | "COLLECTIVE"; hostUserIds: string[];
  resourceCapacity: number; customFields: IntakeField[];
  limitPerDay: number | null; limitPerWeek: number | null; limitPerMonth: number | null; limitPerGuest: number | null;
  horizonBusinessDays: number | null; adjacentOnly: boolean; rulesTimezone: string | null;
};

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "afspraak";

function toDraft(e: EventType | null, userId: string): Draft {
  return e
    ? {
        id: e.id, workspace: Boolean(e.workspaceId), title: e.title, slug: e.slug, durationMinutes: e.durationMinutes,
        bufferBeforeMinutes: e.bufferBeforeMinutes, bufferAfterMinutes: e.bufferAfterMinutes, minimumNoticeHours: e.minimumNoticeHours,
        maxDaysAhead: e.maxDaysAhead, confirmationMode: e.confirmationMode, price: e.priceCents == null ? "" : (e.priceCents / 100).toFixed(2),
        locationKind: e.locationKind, locationValue: e.locationValue ?? "", routingStrategy: e.routingStrategy,
        hostUserIds: e.hosts.map((h) => h.userId), resourceCapacity: e.resourceCapacity, customFields: e.customFields,
        limitPerDay: e.limitPerDay, limitPerWeek: e.limitPerWeek, limitPerMonth: e.limitPerMonth, limitPerGuest: e.limitPerGuest,
        horizonBusinessDays: e.horizonBusinessDays, adjacentOnly: e.adjacentOnly, rulesTimezone: e.rulesTimezone,
      }
    : {
        id: null, workspace: false, title: "", slug: "", durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
        minimumNoticeHours: 2, maxDaysAhead: 30, confirmationMode: "instant", price: "", locationKind: "video", locationValue: "",
        routingStrategy: "STRICT", hostUserIds: [userId], resourceCapacity: 1, customFields: [],
        limitPerDay: null, limitPerWeek: null, limitPerMonth: null, limitPerGuest: null,
        horizonBusinessDays: null, adjacentOnly: false, rulesTimezone: null,
      };
}

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input aria-label={label} type="number" inputMode="numeric" min={min} max={max} step={step ?? 1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

/** Empty = no limit. Out-of-range input is clamped on save. */
function OptionalNumberField({ label, hint, value, onChange, min, max }: { label: string; hint?: string; value: number | null; onChange: (n: number | null) => void; min: number; max: number }) {
  const id = `opt-${label.replace(/\W+/g, "-")}`;
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="numeric" min={min} max={max} placeholder="—" value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.round(Number(e.target.value)))} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const clampOpt = (n: number | null, min: number, max: number) => (n == null || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, n)));

function SchedulingRules({ draft, set }: { draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-6 space-y-4 rounded-xl border border-border bg-background/60 p-4">
      <div>
        <h3 className="text-sm font-semibold">{t("booking.rules.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("booking.rules.intro")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OptionalNumberField label={t("booking.rules.perDay")} value={draft.limitPerDay} min={1} max={200} onChange={(n) => set("limitPerDay", n)} />
        <OptionalNumberField label={t("booking.rules.perWeek")} value={draft.limitPerWeek} min={1} max={1000} onChange={(n) => set("limitPerWeek", n)} />
        <OptionalNumberField label={t("booking.rules.perMonth")} value={draft.limitPerMonth} min={1} max={5000} onChange={(n) => set("limitPerMonth", n)} />
        <OptionalNumberField label={t("booking.rules.perGuest")} hint={t("booking.rules.perGuestHint")} value={draft.limitPerGuest} min={1} max={50} onChange={(n) => set("limitPerGuest", n)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={draft.horizonBusinessDays != null} onCheckedChange={(v) => set("horizonBusinessDays", v ? 10 : null)} className="mt-0.5 shrink-0" />
            <span className="min-w-0"><span className="block font-medium">{t("booking.rules.businessDays")}</span>
              <span className="block text-xs text-muted-foreground">{t("booking.rules.businessDaysHint")}</span></span>
          </label>
          {draft.horizonBusinessDays != null && (
            <OptionalNumberField label={t("booking.rules.businessDaysCount")} value={draft.horizonBusinessDays} min={1} max={260} onChange={(n) => set("horizonBusinessDays", n ?? 1)} />
          )}
        </div>
        <label className="flex items-start gap-3 text-sm">
          <Switch checked={draft.adjacentOnly} onCheckedChange={(v) => set("adjacentOnly", v)} className="mt-0.5 shrink-0" />
          <span className="min-w-0"><span className="block font-medium">{t("booking.rules.adjacent")}</span>
            <span className="block text-xs text-muted-foreground">{t("booking.rules.adjacentHint")}</span></span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{t("booking.rules.holdNote")}</p>
    </div>
  );
}

function Types({ data }: { data: Studio }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toggle = useServerFn(setBookingEventTypeActive);
  const [draft, setDraft] = useState<Draft | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="space-y-4">
      {draft ? (
        <EventTypeForm data={data} draft={draft} setDraft={setDraft} onDone={() => setDraft(null)} />
      ) : (
        <Button onClick={() => setDraft(toDraft(null, data.userId))}><CalendarClock className="h-4 w-4" />{t("booking.type.new")}</Button>
      )}
      {data.eventTypes.length === 0 && !draft && <Panel><p className="text-sm text-muted-foreground">{t("booking.type.empty")}</p></Panel>}
      {data.eventTypes.map((e) => (
        <Panel key={e.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{e.title}</span>
                <Badge variant="secondary">{t("booking.public.minutes", { n: e.durationMinutes })}</Badge>
                {e.priceCents != null && <Badge variant="secondary">€ {(e.priceCents / 100).toFixed(2)}</Badge>}
                {e.workspaceId && <Badge variant="outline">{t(`booking.type.routing.${e.routingStrategy}`)}</Badge>}
                <Badge variant="outline">{t(`booking.type.mode.${e.confirmationMode}`)}</Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">{origin}/book/{e.id}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={e.isActive} onCheckedChange={async (v) => { await toggle({ data: { id: e.id, active: v } }); await qc.invalidateQueries({ queryKey: QK }); }} />
                {t("booking.type.active")}
              </label>
              <Button size="sm" variant="soft" onClick={() => { void navigator.clipboard.writeText(`${origin}/book/${e.id}`); toast.success(t("booking.type.copied")); }}>
                <Copy className="h-4 w-4" /><span className="sr-only">{t("booking.type.link")}</span>
              </Button>
              <Button size="sm" variant="soft" onClick={() => setDraft(toDraft(e, data.userId))}>{t("booking.type.edit")}</Button>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function EventTypeForm({ data, draft, setDraft, onDone }: { data: Studio; draft: Draft; setDraft: (d: Draft) => void; onDone: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const save = useServerFn(saveBookingEventType);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const members = data.members;
  const submit = async () => {
    const price = draft.price.trim() ? Math.round(Number(draft.price.replace(",", ".")) * 100) : null;
    if (!draft.title.trim() || (price != null && (!Number.isFinite(price) || price < 50))) return toast.error(t("booking.err.invalid"));
    const ws = draft.workspace && data.workspaceId;
    setSaving(true);
    const r = await save({
      data: {
        id: draft.id,
        input: {
          ownerUserId: ws ? null : data.userId, workspaceId: ws ? data.workspaceId : null,
          slug: draft.slug || slugify(draft.title), title: draft.title.trim(), description: null,
          durationMinutes: draft.durationMinutes, bufferBeforeMinutes: draft.bufferBeforeMinutes, bufferAfterMinutes: draft.bufferAfterMinutes,
          minimumNoticeHours: draft.minimumNoticeHours, maxDaysAhead: draft.maxDaysAhead, slotStepMinutes: 15,
          confirmationMode: draft.confirmationMode, priceCents: price, currency: "eur",
          routingStrategy: ws ? draft.routingStrategy : "STRICT", locationKind: draft.locationKind,
          locationValue: draft.locationValue.trim() || null,
          resourceCapacity: Math.min(100, Math.max(1, Math.round(draft.resourceCapacity) || 1)),
          customFields: draft.customFields.map((f) => ({ ...f, label: f.label.trim() })).filter((f) => f.label),
          hostUserIds: ws ? (draft.routingStrategy === "STRICT" ? draft.hostUserIds.slice(0, 1) : draft.hostUserIds) : [data.userId],
          limitPerDay: clampOpt(draft.limitPerDay, 1, 200), limitPerWeek: clampOpt(draft.limitPerWeek, 1, 1000),
          limitPerMonth: clampOpt(draft.limitPerMonth, 1, 5000), limitPerGuest: clampOpt(draft.limitPerGuest, 1, 50),
          horizonBusinessDays: clampOpt(draft.horizonBusinessDays, 1, 260), adjacentOnly: draft.adjacentOnly,
          rulesTimezone: draft.rulesTimezone,
        },
      },
    }).catch(() => ({ ok: false as const, reason: "invalid" }));
    setSaving(false);
    if (!r.ok) return toast.error(r.reason === "slug_taken" ? t("booking.err.slug_taken") : r.reason === "invalid" ? t("booking.err.invalid") : t("booking.err.generic"));
    toast.success(t("booking.type.saved"));
    await qc.invalidateQueries({ queryKey: QK });
    onDone();
  };
  const moveUp = (i: number) => {
    if (i === 0) return;
    const h = [...draft.hostUserIds];
    [h[i - 1], h[i]] = [h[i]!, h[i - 1]!];
    set("hostUserIds", h);
  };
  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("booking.type.name")}</Label>
          <Input aria-label={t("booking.type.name")} value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value, slug: draft.id ? draft.slug : slugify(e.target.value) })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("booking.type.slug")}</Label>
          <Input aria-label={t("booking.type.slug")} value={draft.slug} maxLength={63} onChange={(e) => set("slug", slugify(e.target.value))} />
        </div>
        {data.workspaceId && !draft.id && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("booking.type.owner")}</Label>
            <Select value={draft.workspace ? "ws" : "me"} onValueChange={(v) => setDraft({ ...draft, workspace: v === "ws", hostUserIds: [data.userId], routingStrategy: "STRICT" })}>
              <SelectTrigger aria-label={t("booking.type.owner")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">{t("booking.type.owner.personal")}</SelectItem>
                <SelectItem value="ws">{t("booking.type.owner.workspace")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <NumberField label={t("booking.type.duration")} value={draft.durationMinutes} min={5} max={480} step={5} onChange={(n) => set("durationMinutes", n)} />
        <NumberField label={t("booking.type.notice")} value={draft.minimumNoticeHours} min={0} max={720} onChange={(n) => set("minimumNoticeHours", n)} />
        <NumberField label={t("booking.type.bufferBefore")} value={draft.bufferBeforeMinutes} min={0} max={240} step={5} onChange={(n) => set("bufferBeforeMinutes", n)} />
        <NumberField label={t("booking.type.bufferAfter")} value={draft.bufferAfterMinutes} min={0} max={240} step={5} onChange={(n) => set("bufferAfterMinutes", n)} />
        <NumberField label={t("booking.type.horizon")} value={draft.maxDaysAhead} min={1} max={365} onChange={(n) => set("maxDaysAhead", n)} />
        <div className="space-y-1.5">
          <Label>{t("booking.type.price")}</Label>
          <Input aria-label={t("booking.type.price")} inputMode="decimal" placeholder="0,00" value={draft.price} onChange={(e) => set("price", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("booking.type.mode")}</Label>
          <Select value={draft.confirmationMode} onValueChange={(v) => set("confirmationMode", v as Draft["confirmationMode"])}>
            <SelectTrigger aria-label={t("booking.type.mode")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="instant">{t("booking.type.mode.instant")}</SelectItem>
              <SelectItem value="request">{t("booking.type.mode.request")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("booking.type.location")}</Label>
          <Select value={draft.locationKind} onValueChange={(v) => set("locationKind", v as Draft["locationKind"])}>
            <SelectTrigger aria-label={t("booking.type.location")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="video">{t("booking.type.location.video")}</SelectItem>
              <SelectItem value="address">{t("booking.type.location.address")}</SelectItem>
              <SelectItem value="phone">{t("booking.type.location.phone")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("booking.type.locationValue")}</Label>
          <Input aria-label={t("booking.type.locationValue")} value={draft.locationValue} maxLength={500} onChange={(e) => set("locationValue", e.target.value)} />
        </div>
        {draft.workspace && data.workspaceId && (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("booking.type.routing")}</Label>
              <Select value={draft.routingStrategy} onValueChange={(v) => setDraft({ ...draft, routingStrategy: v as Draft["routingStrategy"], hostUserIds: v === "STRICT" ? draft.hostUserIds.slice(0, 1) : draft.hostUserIds })}>
                <SelectTrigger aria-label={t("booking.type.routing")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["STRICT", "ROUND_ROBIN", "COLLECTIVE"] as const).map((r) => <SelectItem key={r} value={r}>{t(`booking.type.routing.${r}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("booking.type.hosts")}</Label>
              <div className="space-y-1.5">
                {draft.hostUserIds.map((id, i) => (
                  <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <span className="truncate">{i + 1}. {members.find((m) => m.user_id === id)?.name ?? id}</span>
                    <div className="flex gap-1">
                      {draft.routingStrategy !== "STRICT" && i > 0 && <Button size="sm" variant="ghost" onClick={() => moveUp(i)} aria-label={t("booking.type.up")}><ArrowUp className="h-4 w-4" /></Button>}
                      {draft.hostUserIds.length > 1 && <Button size="sm" variant="ghost" onClick={() => set("hostUserIds", draft.hostUserIds.filter((h) => h !== id))}><X className="h-4 w-4" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
              {(draft.routingStrategy !== "STRICT" || draft.hostUserIds.length === 0) && (
                <div className="flex flex-wrap gap-2">
                  {members.filter((m) => !draft.hostUserIds.includes(m.user_id)).map((m) => (
                    <Button key={m.user_id} size="sm" variant="soft" onClick={() => set("hostUserIds", [...draft.hostUserIds, m.user_id])}>+ {m.name}</Button>
                  ))}
                </div>
              )}
              {draft.routingStrategy === "STRICT" && (
                <Select value={draft.hostUserIds[0] ?? ""} onValueChange={(v) => set("hostUserIds", [v])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          </>
        )}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <NumberField label="Capaciteit per tijdslot" value={draft.resourceCapacity} onChange={(n) => set("resourceCapacity", n)} min={1} max={100} />
        <p className="self-end text-xs text-muted-foreground">Meer dan 1 = meerdere gasten tegelijk in hetzelfde tijdslot (groepssessie, meerdere stoelen).</p>
      </div>
      {data.phase2 && <SchedulingRules draft={draft} set={set} />}
      <IntakeEditor fields={draft.customFields} onChange={(f) => set("customFields", f)} />
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{t("booking.type.save")}</Button>
        <Button variant="soft" onClick={onDone}>{t("booking.public.back")}</Button>
      </div>
    </Panel>
  );
}

// ---------- intake fields ----------

const FIELD_TYPES: { v: IntakeField["type"]; l: string }[] = [
  { v: "text", l: "Korte tekst" }, { v: "textarea", l: "Lange tekst" }, { v: "select", l: "Keuzelijst" },
  { v: "checkbox", l: "Vinkje" }, { v: "phone", l: "Telefoon" },
];

function IntakeEditor({ fields, onChange }: { fields: IntakeField[]; onChange: (f: IntakeField[]) => void }) {
  const upd = (i: number, patch: Partial<IntakeField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = () => {
    let n = fields.length + 1;
    while (fields.some((f) => f.id === `q${n}`)) n++;
    onChange([...fields, { id: `q${n}`, label: "", type: "text", required: false, options: [], sensitive: false }]);
  };
  return (
    <div className="mt-6 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Intakevragen</h3>
        <p className="text-xs text-muted-foreground">Gasten vullen deze in na het kiezen van een tijdslot. Gevoelige antwoorden worden versleuteld opgeslagen en alleen aan jou getoond.</p>
      </div>
      {fields.map((f, i) => (
        <div key={f.id} className="space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap gap-2">
            <Input aria-label={`Vraag ${i + 1}`} className="min-w-0 flex-1" placeholder="Vraag (bv. Allergieën of klachten)" maxLength={120} value={f.label} onChange={(e) => upd(i, { label: e.target.value })} />
            <Select value={f.type} onValueChange={(v) => upd(i, { type: v as IntakeField["type"] })}>
              <SelectTrigger aria-label={`Soort antwoord vraag ${i + 1}`} className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{FIELD_TYPES.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="ghost" aria-label="Vraag verwijderen" onClick={() => onChange(fields.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
          {f.type === "select" && (
            <Input aria-label={`Opties vraag ${i + 1}`} placeholder="Opties, gescheiden door komma's" value={f.options.join(", ")}
              onChange={(e) => upd(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean).slice(0, 20) })} />
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><Switch checked={f.required} onCheckedChange={(v) => upd(i, { required: v })} />Verplicht</label>
            <label className="flex items-center gap-2"><Switch checked={f.sensitive} onCheckedChange={(v) => upd(i, { sensitive: v })} />Gevoelig (versleuteld)</label>
          </div>
        </div>
      ))}
      {fields.length < 20 && <Button size="sm" variant="soft" onClick={add}>+ Vraag toevoegen</Button>}
    </div>
  );
}

// ---------- availability ----------

const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHm = (s: string) => { const [h, m] = s.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };

function Availability({ data }: { data: Studio }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const save = useServerFn(saveAvailabilityRules);
  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [tz, setTz] = useState(data.rules[0]?.timezone ?? browserTz);
  const [days, setDays] = useState(() =>
    [1, 2, 3, 4, 5, 6, 0].map((wd) => {
      const r = data.rules.find((x) => x.weekday === wd);
      return { wd, on: Boolean(r) || (data.rules.length === 0 && wd >= 1 && wd <= 5), start: r?.startMinute ?? 540, end: r?.endMinute ?? 1020 };
    }),
  );
  const [saving, setSaving] = useState(false);
  const dayName = (wd: number) => new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(Date.UTC(2026, 0, 4 + wd)));
  const submit = async () => {
    setSaving(true);
    const ok = await save({ data: { rules: days.filter((d) => d.on && d.end > d.start).map((d) => ({ weekday: d.wd, startMinute: d.start, endMinute: d.end, timezone: tz })) } }).then(() => true, () => false);
    setSaving(false);
    if (ok) { toast.success(t("booking.type.saved")); await qc.invalidateQueries({ queryKey: QK }); } else toast.error(t("booking.err.generic"));
  };
  return (
    <div className="space-y-4">
    <Panel>
      <p className="mb-4 text-sm text-muted-foreground">{t("booking.avail.intro")}</p>
      <div className="mb-4 max-w-sm space-y-1.5">
        <Label>{t("booking.avail.timezone")}</Label>
        <Input aria-label={t("booking.avail.timezone")} value={tz} onChange={(e) => setTz(e.target.value)} />
      </div>
      <div className="space-y-2">
        {days.map((d, i) => (
          <div key={d.wd} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
            <Switch aria-label={dayName(d.wd)} checked={d.on} onCheckedChange={(v) => setDays(days.map((x, j) => (j === i ? { ...x, on: v } : x)))} />
            <span className="w-28 text-sm font-medium capitalize">{dayName(d.wd)}</span>
            {d.on ? (
              <div className="flex items-center gap-2">
                <Input aria-label={`${dayName(d.wd)} vanaf`} type="time" step={900} className="w-28" value={toHm(d.start)} onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, start: fromHm(e.target.value) } : x)))} />
                <span className="text-muted-foreground">–</span>
                <Input aria-label={`${dayName(d.wd)} tot`} type="time" step={900} className="w-28" value={toHm(d.end === 1440 ? 1439 : d.end)} onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, end: fromHm(e.target.value) } : x)))} />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{t("booking.avail.closed")}</span>
            )}
          </div>
        ))}
      </div>
      <Button className="mt-5" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{t("booking.avail.save")}</Button>
    </Panel>
    <Exceptions data={data} tz={tz} />
    </div>
  );
}

/** Converts a wall-clock date+time in `tz` to a UTC ISO instant. */
function zonedToUtc(date: string, time: string, tz: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString();
}

function Exceptions({ data, tz }: { data: Studio; tz: string }) {
  const { locale } = useI18n();
  const qc = useQueryClient();
  const add = useServerFn(addAvailabilityException);
  const remove = useServerFn(removeAvailabilityException);
  const [f, setF] = useState({ kind: "busy" as "busy" | "free", from: "", to: "", allDay: true, start: "09:00", end: "17:00" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.from) return toast.error(trI18n.t("ui.c16e693a3f"));
    const to = f.to || f.from;
    if (to < f.from) return toast.error(trI18n.t("ui.6e9b6deae4"));
    const endDay = new Date(`${to}T00:00:00Z`); endDay.setUTCDate(endDay.getUTCDate() + 1);
    const startUtc = zonedToUtc(f.from, f.allDay ? "00:00" : f.start, tz);
    const endUtc = f.allDay ? zonedToUtc(endDay.toISOString().slice(0, 10), "00:00", tz) : zonedToUtc(to, f.end, tz);
    setBusy(true);
    const r = await add({ data: { kind: f.kind, startUtc, endUtc } }).catch(() => ({ ok: false as const, reason: "invalid" }));
    setBusy(false);
    if (!r.ok) return toast.error(r.reason === "too_many_overrides" ? "Maximaal 100 uitzonderingen." : "Uitzondering kon niet worden opgeslagen.");
    toast.success(trI18n.t("ui.07eb7dc02a"));
    setF({ ...f, from: "", to: "" });
    await qc.invalidateQueries({ queryKey: QK });
  };
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  return (
    <Panel>
      <h3 className="text-sm font-semibold">Uitzonderingen</h3>
      <p className="mb-4 text-xs text-muted-foreground">Bijvoorbeeld vakantie van 1 tot 15 augustus, of een extra opening buiten je vaste uren.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Soort</Label>
          <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v as "busy" | "free" })}>
            <SelectTrigger aria-label="Soort uitzondering"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="busy">Gesloten / afwezig</SelectItem><SelectItem value="free">Extra beschikbaar</SelectItem></SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 self-end text-sm"><Switch checked={f.allDay} onCheckedChange={(v) => setF({ ...f, allDay: v })} />Hele dag(en)</label>
        <div className="space-y-1.5"><Label>Van</Label><Input aria-label="Van" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Tot en met</Label><Input aria-label="Tot en met" type="date" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        {!f.allDay && (
          <>
            <div className="space-y-1.5"><Label>Vanaf</Label><Input aria-label="Vanaf" type="time" step={900} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Tot</Label><Input aria-label="Tot" type="time" step={900} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
          </>
        )}
      </div>
      <Button className="mt-4" onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Uitzondering toevoegen</Button>
      {data.overrides.length > 0 && (
        <ul className="mt-4 space-y-2">
          {data.overrides.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <span className="min-w-0"><Badge variant={o.kind === "busy" ? "secondary" : "default"} className="mr-2">{o.kind === "busy" ? "Gesloten" : "Extra"}</Badge>{fmt.format(new Date(o.startUtc))} – {fmt.format(new Date(o.endUtc))}</span>
              <Button size="sm" variant="ghost" aria-label="Uitzondering verwijderen" onClick={async () => { await remove({ data: { id: o.id } }).catch(() => undefined); await qc.invalidateQueries({ queryKey: QK }); }}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------- calendars ----------

function Calendars({ data }: { data: Studio }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const add = useServerFn(addBookingCalendar);
  const remove = useServerFn(removeBookingCalendar);
  const sync = useServerFn(syncBookingCalendar);
  const [kind, setKind] = useState<"ics" | "caldav">("ics");
  const [form, setForm] = useState({ url: "", label: "", username: "", password: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: QK });
  const submit = async () => {
    setBusy("add");
    const payload = kind === "ics"
      ? { adapter: "ics" as const, label: form.label || null, credentials: { url: form.url.trim().replace(/^webcal:/i, "https:") } }
      : { adapter: "caldav" as const, label: form.label || null, credentials: { url: form.url.trim(), username: form.username, password: form.password } };
    const r = await add({ data: payload }).catch(() => ({ ok: false as const, reason: "invalid" }));
    setBusy(null);
    if (!r.ok) return toast.error(r.reason === "invalid" || r.reason === "invalid_url" ? t("booking.err.invalid") : t("booking.err.generic"));
    toast.success(t("booking.cal.added"));
    setForm({ url: "", label: "", username: "", password: "" });
    await refresh();
  };
  return (
    <div className="space-y-4">
      <Panel>
        <p className="mb-4 text-sm text-muted-foreground">{t("booking.cal.intro")}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" variant={kind === "ics" ? "default" : "soft"} onClick={() => setKind("ics")}><Link2 className="h-4 w-4" />{t("booking.cal.ics")}</Button>
          <Button size="sm" variant={kind === "caldav" ? "default" : "soft"} onClick={() => setKind("caldav")}><CalendarClock className="h-4 w-4" />{t("booking.cal.caldav")}</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("booking.cal.url")}</Label><Input type="url" autoComplete="off" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
          {kind === "caldav" && (
            <>
              <div className="space-y-1.5"><Label>{t("booking.cal.username")}</Label><Input autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("booking.cal.password")}</Label><Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            </>
          )}
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("booking.cal.label")}</Label><Input maxLength={80} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
        </div>
        <Button className="mt-4" onClick={submit} disabled={busy === "add" || !form.url}>{busy === "add" && <Loader2 className="h-4 w-4 animate-spin" />}{t("booking.cal.add")}</Button>
      </Panel>
      {data.calendars.length === 0 && <Panel><p className="text-sm text-muted-foreground">{t("booking.cal.empty")}</p></Panel>}
      {data.calendars.map((c) => (
        <Panel key={c.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.syncStatus === "ok" ? "bg-primary" : c.syncStatus === "error" ? "bg-destructive" : "bg-muted-foreground"}`} aria-hidden />
                <span className="truncate font-medium">{c.label || (c.adapter === "ics" ? "iCal" : "CalDAV")}</span>
                <Badge variant="outline">{c.adapter.toUpperCase()}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.syncStatus === "error" ? t("booking.cal.error", { code: c.lastErrorCode ?? "?" }) : c.lastSyncedAt ? t("booking.cal.lastSync", { when: relative(c.lastSyncedAt, locale) }) : t("booking.cal.never")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="soft" disabled={busy === c.id} onClick={async () => { setBusy(c.id); await sync({ data: { id: c.id } }).catch(() => undefined); setBusy(null); await refresh(); }}>
                <RefreshCw className={`h-4 w-4 ${busy === c.id ? "animate-spin" : ""}`} />{t("booking.cal.sync")}
              </Button>
              <Button size="sm" variant="ghost" onClick={async () => { await remove({ data: { id: c.id } }); await refresh(); }} aria-label={t("booking.cal.remove")}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

