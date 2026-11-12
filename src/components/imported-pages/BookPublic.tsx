import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { CalendarClock, Clock, Globe, Loader2, Lock, MapPin, Phone, Video } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { createBooking, getPublicEventType, getPublicSlots, holdBookingSlot, releaseBookingSlot } from "@/lib/booking-engine/booking.functions";
import { holdCountdown } from "@/lib/booking-engine/hold-rules";
import { IntakeForm } from "@/components/booking/IntakeForm";
import { BookingMonthCalendar } from "@/components/booking/BookingMonthCalendar";
import { TimezonePicker } from "@/components/booking/TimezonePicker";
import { validateIntake, type IntakeAnswers } from "@/lib/booking-engine/intake";
import { offeredSelection } from "@/lib/booking-engine/selection";
import {
  canonicalZone, defaultHourCycle, formatSlotTime, groupByPeriod, groupSlotsByDay, isValidTimeZone, localDayKey, type HourCycle,
} from "@/lib/booking-engine/guest-view-rules";

type PublicType = Awaited<ReturnType<typeof getPublicEventType>>;
/** Loader data: the page renders with type and times already in place (no spinner on arrival). */
export type BookingInitial = { type: PublicType; slots: string[]; at: number };

const TZ_KEY = "rout.booking.tz";
const CLOCK_KEY = "rout.booking.hourCycle";
function readPref(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, value: string | null) {
  try { if (value == null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* private mode */ }
}

export default function BookPublic({ eventTypeId, selectedStart, initial }: { eventTypeId: string; selectedStart?: string; initial?: BookingInitial }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const getType = useServerFn(getPublicEventType);
  const getSlots = useServerFn(getPublicSlots);
  const book = useServerFn(createBooking);
  const holdFn = useServerFn(holdBookingSlot);
  const releaseFn = useServerFn(releaseBookingSlot);
  // Zone and clock are read after hydration so SSR and the first client frame match; until then the
  // time picker shows a same-size placeholder instead of UTC times that would jump a moment later.
  const [prefs, setPrefs] = useState<{ tz: string; device: string; hourCycle: HourCycle } | null>(null);
  useEffect(() => {
    const device = canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    const saved = readPref(TZ_KEY);
    const clock = readPref(CLOCK_KEY);
    setPrefs({
      device,
      tz: saved && isValidTimeZone(saved) ? canonicalZone(saved) : device,
      hourCycle: clock === "h12" || clock === "h23" ? clock : defaultHourCycle(locale),
    });
  }, [locale]);
  const tz = prefs?.tz ?? "UTC";
  const setZone = useCallback((next: string, explicit: boolean) => {
    writePref(TZ_KEY, explicit ? next : null);
    setPrefs((p) => (p ? { ...p, tz: next } : p));
  }, []);
  const setClockPref = useCallback((hc: HourCycle) => {
    writePref(CLOCK_KEY, hc);
    setPrefs((p) => (p ? { ...p, hourCycle: hc } : p));
  }, []);

  const typeQ = useQuery({
    queryKey: ["booking-type", eventTypeId],
    queryFn: () => getType({ data: { id: eventTypeId } }),
    initialData: initial?.type ?? undefined,
    initialDataUpdatedAt: initial?.at,
    staleTime: 5 * 60_000,
  });
  // The visitor's own hold stays visible to them; read through a ref so holding never resets the list.
  const holdRef = useRef<string | null>(null);
  const slotsQ = useQuery({
    queryKey: ["booking-slots", eventTypeId],
    queryFn: () => getSlots({ data: { id: eventTypeId, holdId: holdRef.current } }),
    initialData: initial ? { slots: initial.slots } : undefined,
    initialDataUpdatedAt: initial?.at,
    staleTime: 30_000,
    // Other visitors book and hold too: refresh while the page is open and when it comes back into view.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const byDay = useMemo(() => groupSlotsByDay(slotsQ.data?.slots ?? [], tz), [slotsQ.data, tz]);
  const counts = useMemo(() => new Map([...byDay].map(([k, v]) => [k, v.length])), [byDay]);
  const dayKeys = [...byDay.keys()];
  const [day, setDay] = useState<string | null>(null);
  const activeDay = day && byDay.has(day) ? day : dayKeys[0] ?? null;
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", note: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [selectionApplied, setSelectionApplied] = useState(false);
  // Soft-lock (db/0218): a clicked slot is reserved for a few minutes while the form is filled in.
  const [hold, setHold] = useState<{ holdId: string; secret: string; expiresAt: string; startUtc: string } | null>(null);
  const [holding, setHolding] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { holdRef.current = hold?.holdId ?? null; }, [hold]);
  useEffect(() => {
    if (!hold) return;
    setClock(Date.now());
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hold]);
  const countdown = hold ? holdCountdown(hold.expiresAt, clock) : null;

  useEffect(() => {
    if (selectionApplied || !slotsQ.data || !prefs) return;
    const offered = offeredSelection(selectedStart, slotsQ.data.slots);
    if (offered) { setDay(localDayKey(offered, tz)); void pickSlot(offered); }
    setSelectionApplied(true);
    // pickSlot only reads stable setters and the current hold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStart, slotsQ.data, tz, prefs, selectionApplied]);

  const releaseHold = (h = hold) => {
    if (!h) return;
    setHold(null);
    void releaseFn({ data: { holdId: h.holdId, secret: h.secret } }).catch(() => undefined);
  };

  /** Open the form for a start and reserve it; without soft-locks (or on a hiccup) the form still opens. */
  async function pickSlot(start: string) {
    setError(null);
    setSlot(start);
    const meta = typeQ.data;
    if (meta && meta.holdMinutes == null) return;
    setHolding(true);
    const previous = hold;
    const r = await holdFn({ data: { eventTypeId, startUtc: start, replace: previous ? { id: previous.holdId, secret: previous.secret } : null } })
      .catch(() => ({ ok: false as const, reason: "unavailable" as const }));
    setHolding(false);
    if (r.ok) { setHold({ holdId: r.holdId, secret: r.secret, expiresAt: r.expiresAt, startUtc: r.startUtc }); return; }
    setHold(null);
    if (r.reason === "slot_taken" || r.reason === "too_soon" || r.reason === "too_far" || r.reason === "outside_availability") {
      setSlot(null); setError(t("booking.public.slotTaken")); void slotsQ.refetch();
    } else if (r.reason === "too_many_holds") { setSlot(null); setError(t("booking.public.tooManyHolds")); }
    else if (r.reason === "rate_limited") { setSlot(null); setError(t("booking.public.rateLimited")); }
    else if (r.reason === "inactive") { setSlot(null); setError(t("booking.public.notFound")); }
    // "unavailable": book without a reservation; the database still refuses a taken slot.
  }

  const et = typeQ.data;
  if (typeQ.isLoading && !typeQ.data) return <AppLayout><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppLayout>;
  if (!et) return <AppLayout><p className="py-20 text-center text-muted-foreground">{t("booking.public.notFound")}</p></AppLayout>;

  const hourCycle = prefs?.hourCycle ?? "h23";
  const dayLabel = (k: string) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${k}T12:00:00Z`));
  const timeLabel = (iso: string) => formatSlotTime(iso, locale, tz, hourCycle);
  const today = localDayKey(new Date().toISOString(), tz);
  const LocIcon = et.locationKind === "video" ? Video : et.locationKind === "phone" ? Phone : MapPin;

  const submit = async () => {
    if (!slot || sending) return;
    const checked = validateIntake(et.customFields, answers);
    if (!checked.ok) { setError(t("booking.err.invalid")); return; }
    setSending(true);
    setError(null);
    const held = hold && hold.startUtc === slot ? hold : null;
    const r = await book({ data: { eventTypeId, startUtc: slot, guestName: form.name, guestEmail: form.email, guestTimezone: tz, guestNote: form.note || null,
      intakeAnswers: checked.answers, holdId: held?.holdId ?? null, holdSecret: held?.secret ?? null } })
      .catch(() => ({ ok: false as const, reason: "invalid" as const }));
    setSending(false);
    if (r.ok) {
      setHold(null);
      if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
      void navigate({ to: "/booking/$bookingId", params: { bookingId: r.bookingId }, search: { paid: undefined, token: r.bookingToken ?? undefined } });
      return;
    }
    if (r.reason === "slot_taken") { setError(t("booking.public.slotTaken")); setHold(null); setSlot(null); void slotsQ.refetch(); }
    else if (r.reason === "guest_limit") setError(t("booking.public.guestLimit"));
    else if (r.reason === "payment_unavailable") setError(t("booking.public.paymentUnavailable"));
    else if (r.reason === "rate_limited") setError(t("booking.public.rateLimited"));
    else if (r.reason === "invalid" || r.reason === "invalid_intake") setError(t("booking.err.invalid"));
    else setError(t("booking.err.generic"));
  };

  return (
    <AppLayout>
      <div className="mx-auto grid max-w-5xl gap-6 py-6 md:grid-cols-[minmax(0,0.85fr)_minmax(0,2fr)]">
        <section className="h-fit space-y-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          {et.hostName && <p className="text-sm text-muted-foreground">{et.hostName}</p>}
          <h1 className="text-2xl font-bold tracking-tight">{et.title}</h1>
          {et.description && <p className="text-sm text-muted-foreground">{et.description}</p>}
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />{t("booking.public.minutes", { n: et.durationMinutes })}</li>
            <li className="flex items-center gap-2"><LocIcon className="h-4 w-4 text-muted-foreground" />{t(`booking.type.location.${et.locationKind}`)}</li>
            <li className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" />{et.priceCents != null ? `€ ${(et.priceCents / 100).toFixed(2)}` : t("booking.public.free")}</li>
            <li className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" />{prefs ? t("booking.public.timezone", { tz: tz.split("/").pop()!.replace(/_/g, " ") }) : t("booking.public.timezoneDetecting")}</li>
          </ul>
        </section>

        <section aria-labelledby="bk-pick" className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <h2 id="bk-pick" className="sr-only">{t("booking.public.pickDay")}</h2>
          {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {!prefs || (slotsQ.isLoading && !slotsQ.data) ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" aria-busy="true">
              <Skeleton className="aspect-[7/6] w-full rounded-xl" />
              <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}</div>
            </div>
          ) : dayKeys.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">{t("booking.public.noSlots")}</p>
              <div className="flex justify-center"><TimezonePicker value={tz} device={prefs.device} onChange={setZone} /></div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <BookingMonthCalendar counts={counts} activeDay={activeDay} today={today} onPick={(k) => { setDay(k); setError(null); }} />
              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold first-letter:uppercase" aria-live="polite">{activeDay ? dayLabel(activeDay) : t("booking.public.pickTime")}</h3>
                  <ToggleGroup type="single" size="sm" value={hourCycle} onValueChange={(v) => { if (v === "h12" || v === "h23") setClockPref(v); }} aria-label={t("booking.public.timeFormat")}>
                    <ToggleGroupItem value="h12" className="h-7 px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{t("booking.public.h12")}</ToggleGroupItem>
                    <ToggleGroupItem value="h23" className="h-7 px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{t("booking.public.h24")}</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <TimezonePicker value={tz} device={prefs.device} onChange={setZone} />
                {activeDay && (
                  <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
                    {groupByPeriod(byDay.get(activeDay) ?? [], tz).map((g) => (
                      <div key={g.period} role="group" aria-label={t(`booking.public.period.${g.period}`)}>
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t(`booking.public.period.${g.period}`)}</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                          {g.slots.map((s) => (
                            <Button key={s} size="sm" variant={s === slot ? "default" : "soft"} className="tabular-nums" aria-pressed={s === slot} disabled={holding} onClick={() => void pickSlot(s)}>
                              {timeLabel(s)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={Boolean(slot)} onOpenChange={(o) => { if (!o) { releaseHold(); setSlot(null); } }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("booking.public.yourDetails")}</DialogTitle>
          </DialogHeader>
          {slot && (
            <p className="text-sm text-muted-foreground">
              {et.title} · {new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", hourCycle, timeZone: tz }).format(new Date(slot))} · {tz.replace(/_/g, " ")}
            </p>
          )}
          {holding && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("booking.public.holding")}</p>
          )}
          {countdown && !countdown.expired && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">{t("booking.public.heldFor")}</span>
              <span role="timer" aria-label={t("booking.public.heldFor")} className="ml-auto font-mono tabular-nums font-semibold">{countdown.label}</span>
            </div>
          )}
          {countdown?.expired && (
            <div role="alert" className="space-y-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
              <p>{t("booking.public.holdExpired")}</p>
              <Button type="button" size="sm" variant="soft" disabled={holding} onClick={() => slot && void pickSlot(slot)}>{t("booking.public.holdAgain")}</Button>
            </div>
          )}
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="space-y-1.5"><Label htmlFor="bk-name">{t("booking.public.name")}</Label><Input id="bk-name" required maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="bk-email">{t("booking.public.email")}</Label><Input id="bk-email" required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="bk-note">{t("booking.public.note")}</Label><Textarea id="bk-note" maxLength={2000} rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            <IntakeForm fields={et.customFields} answers={answers} onChange={setAnswers} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {et.priceCents != null ? t("booking.public.pay") : et.confirmationMode === "request" ? t("booking.public.request") : t("booking.public.book")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
