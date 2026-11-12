/**
 * Availability bitmaps: one bit(96) per user per UTC day, bit i = the 15-minute
 * slot starting at i*15 min after 00:00 UTC. "1" = free. Strings match how
 * Postgres returns bit(n) values, so SQL `bit_and` and JS agree.
 */
import { SLOT_MINUTES, SLOTS_PER_DAY, type AvailabilityRule, type EventTypeRules, type UtcInterval } from "./types";
import { addMinutes, isoDay, startOfUtcDay, wallParts, zonedToUtc } from "./time";

export type DayBits = string; // length 96, "0"/"1"

export const emptyDay = (): DayBits => "0".repeat(SLOTS_PER_DAY);

function setRange(bits: DayBits, from: number, to: number, value: "0" | "1"): DayBits {
  const a = Math.max(0, from), b = Math.min(SLOTS_PER_DAY, to);
  if (b <= a) return bits;
  return bits.slice(0, a) + value.repeat(b - a) + bits.slice(b);
}

/** Paint an interval onto the day starting at `dayUtc`; partial slots round outward for busy, inward for free. */
export function paint(bits: DayBits, dayUtc: Date, iv: UtcInterval, value: "0" | "1"): DayBits {
  const base = dayUtc.getTime();
  const s = (iv.startUtc.getTime() - base) / 60000 / SLOT_MINUTES;
  const e = (iv.endUtc.getTime() - base) / 60000 / SLOT_MINUTES;
  return value === "0" ? setRange(bits, Math.floor(s), Math.ceil(e), "0") : setRange(bits, Math.ceil(s), Math.floor(e), "1");
}

export function andBits(list: DayBits[]): DayBits {
  if (list.length === 0) return emptyDay();
  let out = "";
  for (let i = 0; i < SLOTS_PER_DAY; i++) out += list.every((b) => b[i] === "1") ? "1" : "0";
  return out;
}

export function orBits(list: DayBits[]): DayBits {
  let out = "";
  for (let i = 0; i < SLOTS_PER_DAY; i++) out += list.some((b) => b[i] === "1") ? "1" : "0";
  return out;
}

/** Weekly rules (in their own zones) → UTC intervals overlapping [from, to). DST handled per date. */
export function expandRules(rules: AvailabilityRule[], from: Date, to: Date): UtcInterval[] {
  const out: UtcInterval[] = [];
  // Walk local dates with one day of margin on each side so zone offsets never drop a window.
  for (let t = addMinutes(from, -1440); t < addMinutes(to, 1440); t = addMinutes(t, 1440)) {
    for (const r of rules) {
      const w = wallParts(t, r.timezone);
      if (w.weekday !== r.weekday) continue;
      const startUtc = zonedToUtc(w.year, w.month, w.day, r.startMinute, r.timezone);
      const endUtc = zonedToUtc(w.year, w.month, w.day, r.endMinute, r.timezone);
      if (endUtc > from && startUtc < to) out.push({ startUtc, endUtc });
    }
  }
  // Dedupe (margin walk may visit a local date twice).
  const seen = new Set<string>();
  return out.filter((iv) => {
    const k = `${iv.startUtc.getTime()}-${iv.endUtc.getTime()}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

export interface ComputeInput {
  rules: AvailabilityRule[];
  freeOverrides: UtcInterval[];
  busy: UtcInterval[]; // overrides(busy) + blocking calendar events + active bookings (their block range)
  fromDay: Date; // UTC midnight
  days: number;
}

/** Pre-compute: free = (rules ∪ free overrides) − busy, per UTC day. */
export function computeDays(input: ComputeInput): { day: string; bits: DayBits }[] {
  const from = startOfUtcDay(input.fromDay);
  const to = addMinutes(from, input.days * 1440);
  const free = [...expandRules(input.rules, from, to), ...input.freeOverrides];
  const out: { day: string; bits: DayBits }[] = [];
  for (let d = 0; d < input.days; d++) {
    const dayUtc = addMinutes(from, d * 1440);
    const dayEnd = addMinutes(dayUtc, 1440);
    let bits = emptyDay();
    for (const iv of free) if (iv.endUtc > dayUtc && iv.startUtc < dayEnd) bits = paint(bits, dayUtc, iv, "1");
    for (const iv of input.busy) if (iv.endUtc > dayUtc && iv.startUtc < dayEnd) bits = paint(bits, dayUtc, iv, "0");
    out.push({ day: isoDay(dayUtc), bits });
  }
  return out;
}

/** Concatenate days (sorted, consecutive) into one timeline starting at the first day. */
function timeline(days: { day: string; bits: DayBits }[]): { start: Date; bits: string } {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  return { start: new Date(`${sorted[0]?.day ?? "1970-01-01"}T00:00:00Z`), bits: sorted.map((d) => d.bits).join("") };
}

/**
 * Bookable start instants from cached bits. A start is bookable when every slot
 * of [start − bufferBefore, start + duration + bufferAfter) is free, it respects
 * minimum notice and the horizon, and it sits on the step grid. Slot indices
 * match db/0216-0218: floor(block start) .. ceil(block end) on the 15-minute grid.
 * `adjacentOnly`: the block must touch something taken (or the edge of working
 * hours) right before or right after it, so the day never gets gaps.
 */
export function bookableStarts(days: { day: string; bits: DayBits }[], rules: EventTypeRules, now: Date): Date[] {
  if (days.length === 0) return [];
  const { start, bits } = timeline(days);
  const before = Math.ceil(rules.bufferBeforeMinutes / SLOT_MINUTES);
  const tail = Math.ceil((rules.durationMinutes + rules.bufferAfterMinutes) / SLOT_MINUTES);
  const step = rules.slotStepMinutes / SLOT_MINUTES;
  const earliest = now.getTime() + rules.minimumNoticeHours * 3600000;
  const horizon = rules.horizonEndUtc ? rules.horizonEndUtc.getTime() : null;
  const latest = now.getTime() + rules.maxDaysAhead * 86400000;
  const out: Date[] = [];
  for (let i = 0; i < bits.length; i += step) {
    const at = start.getTime() + i * SLOT_MINUTES * 60000;
    if (at < earliest) continue;
    if (horizon != null ? at >= horizon : at > latest) continue;
    const a = i - before, b = i + tail;
    if (a < 0 || b > bits.length) continue;
    if (bits.slice(a, b).includes("0")) continue;
    if (rules.adjacentOnly && !(a === 0 || bits[a - 1] === "0" || b === bits.length || bits[b] === "0")) continue;
    out.push(new Date(at));
  }
  return out;
}

/** Block range a booking occupies (buffers included). */
export function blockRange(startUtc: Date, rules: Pick<EventTypeRules, "durationMinutes" | "bufferBeforeMinutes" | "bufferAfterMinutes">) {
  return {
    startUtc,
    endUtc: addMinutes(startUtc, rules.durationMinutes),
    blockStartUtc: addMinutes(startUtc, -rules.bufferBeforeMinutes),
    blockEndUtc: addMinutes(startUtc, rules.durationMinutes + rules.bufferAfterMinutes),
  };
}
