import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  addDays,
  monthGrid,
  monthKey,
  monthsBetween,
  weekStartFor,
} from "@/lib/booking-engine/guest-view-rules";

type Props = {
  /** Day keys (YYYY-MM-DD, visitor's zone) that have at least one free time, with their count. */
  counts: Map<string, number>;
  activeDay: string | null;
  today: string;
  onPick: (day: string) => void;
};

/**
 * Month view of the bookable days (WAI-ARIA grid): arrows move a day/week,
 * Home/End to the week edges, PageUp/PageDown a month. Days without times stay
 * focusable (aria-disabled) so keyboard travel never jumps unexpectedly.
 */
export function BookingMonthCalendar({ counts, activeDay, today, onPick }: Props) {
  const { t, locale } = useI18n();
  const weekStart = weekStartFor(locale);
  const days = useMemo(() => [...counts.keys()].sort(), [counts]);
  const months = useMemo(
    () => (days.length ? monthsBetween(days[0]!, days[days.length - 1]!) : []),
    [days],
  );
  const [month, setMonth] = useState<string | null>(null);
  const visible =
    month && months.includes(month)
      ? month
      : activeDay
        ? monthKey(activeDay)
        : (months[0] ?? monthKey(today));
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const grid = useMemo(() => monthGrid(visible, weekStart), [visible, weekStart]);
  const gridRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);

  // Keep the visible month on the picked day when the list changes underneath.
  useEffect(() => {
    if (activeDay) setMonth(monthKey(activeDay));
  }, [activeDay]);
  const focusable =
    focusDay && monthKey(focusDay) === visible
      ? focusDay
      : activeDay && monthKey(activeDay) === visible
        ? activeDay
        : (days.find((d) => monthKey(d) === visible) ?? `${visible}-01`);

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusable}"]`)?.focus();
  }, [focusable]);

  const idx = months.indexOf(visible);
  const go = (delta: number) => {
    const next = months[idx + delta];
    if (next) {
      setMonth(next);
      setFocusDay(null);
    }
  };

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${visible}-15T12:00:00Z`));
  const weekdayLabels = grid[0]!.map((c) => ({
    short: new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(
      new Date(`${c.day}T12:00:00Z`),
    ),
    long: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
      new Date(`${c.day}T12:00:00Z`),
    ),
  }));
  const fullLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));

  function onKey(e: KeyboardEvent<HTMLButtonElement>, day: string) {
    const col = grid.flat().findIndex((c) => c.day === day) % 7;
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(day, -1),
      ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7),
      ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -col),
      End: () => addDays(day, 6 - col),
      PageUp: () => shiftMonth(day, -1),
      PageDown: () => shiftMonth(day, 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const target = move();
    const m = monthKey(target);
    if (!months.includes(m)) return;
    wantFocus.current = true;
    setFocusDay(target);
    setMonth(m);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold capitalize" aria-live="polite">
          {monthLabel}
        </h3>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => go(-1)}
            disabled={idx <= 0}
            aria-label={t("booking.public.prevMonth")}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => go(1)}
            disabled={idx < 0 || idx >= months.length - 1}
            aria-label={t("booking.public.nextMonth")}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={t("booking.public.calendarLabel")}
        className="select-none"
      >
        <div role="row" className="grid grid-cols-7 gap-1 pb-1">
          {weekdayLabels.map((w, i) => (
            <div
              key={i}
              role="columnheader"
              aria-label={w.long}
              className="text-center text-[11px] font-medium uppercase text-muted-foreground"
            >
              <abbr title={w.long} className="no-underline">
                {w.short}
              </abbr>
            </div>
          ))}
        </div>
        {grid.map((week) => (
          <div key={week[0]!.day} role="row" className="grid grid-cols-7 gap-1">
            {week.map((c) => {
              const n = counts.get(c.day) ?? 0;
              const available = n > 0 && c.inMonth;
              const selected = c.day === activeDay;
              return (
                <div key={c.day} role="gridcell" aria-selected={selected}>
                  <button
                    type="button"
                    data-day={c.day}
                    data-spatial-control="calendar-day"
                    tabIndex={c.day === focusable ? 0 : -1}
                    aria-disabled={!available}
                    aria-current={c.day === today ? "date" : undefined}
                    aria-label={
                      available
                        ? `${fullLabel(c.day)}, ${t("booking.public.slotsCount", { n })}`
                        : fullLabel(c.day)
                    }
                    onKeyDown={(e) => onKey(e, c.day)}
                    onFocus={() => setFocusDay(c.day)}
                    onClick={() => {
                      if (available) onPick(c.day);
                    }}
                    className={cn(
                      "relative flex aspect-square w-full flex-col items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                      !c.inMonth && "invisible",
                      available &&
                        !selected &&
                        "border border-border bg-secondary font-semibold text-foreground shadow-sm hover:border-foreground/30 hover:bg-secondary/70",
                      !available &&
                        c.inMonth &&
                        "cursor-default border border-transparent bg-transparent text-muted-foreground/50 line-through decoration-muted-foreground/20",
                      selected && "bg-primary font-semibold text-primary-foreground",
                      c.day === today && !selected && "ring-1 ring-inset ring-border",
                    )}
                  >
                    {Number(c.day.slice(8))}
                    {available && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute bottom-1 h-1 w-1 rounded-full",
                          selected ? "bg-primary-foreground" : "bg-primary",
                        )}
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function shiftMonth(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + delta, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}
