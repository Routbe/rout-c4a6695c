/**
 * Public slot rules for teams. Each host's starts are computed on that host's
 * own timeline first and only then combined, so a slot is never offered when
 * the free time comes from different hosts stitched together (host A free
 * 10:00–10:15 + host B free 10:15–10:30 is not a 30-minute slot).
 */
import { bookableStarts, emptyDay, type DayBits } from "./bitmap";
import type { EventTypeRules } from "./types";

export type HostDay = { day: string; bits: DayBits };

/**
 * What the database adds on top of the cached bits (db/0218 public constraints):
 * `busy` = another visitor's live hold (block range), `limit` = a calendar period
 * in which the host reached a limit of this type. Both are per host ordinal.
 */
/**
 * busy = another visitor's hold (block overlap); limit = a full day/week/month (start inside);
 * session = a group session (db/0219): overlapping starts are refused, except its own start
 * while seats remain (`openStart`), exactly like rout_booking_host_free_held.
 */
export type HostConstraint =
  | { kind: "busy" | "limit"; startUtc: Date; endUtc: Date }
  | { kind: "session"; startUtc: Date; endUtc: Date; openStart: Date | null };

/** Drop the starts a host cannot take because of holds, group sessions (block overlap) or full periods (start inside). */
export function applyHostConstraints(starts: Date[], constraints: HostConstraint[], rules: EventTypeRules): Date[] {
  if (!constraints.length) return starts;
  const before = rules.bufferBeforeMinutes * 60000;
  const after = (rules.durationMinutes + rules.bufferAfterMinutes) * 60000;
  return starts.filter((s) => {
    const t = s.getTime();
    return !constraints.some((c) => {
      const a = c.startUtc.getTime(), b = c.endUtc.getTime();
      if (c.kind === "limit") return t >= a && t < b;
      if (c.kind === "session" && c.openStart && c.openStart.getTime() === t) return false;
      return t - before < b && t + after > a;
    });
  });
}

/** Consecutive days from the first to the last given day; missing days are busy. */
export function contiguousDays(days: HostDay[]): HostDay[] {
  if (!days.length) return [];
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const map = new Map(sorted.map((d) => [d.day, d.bits]));
  const out: HostDay[] = [];
  const end = new Date(`${sorted[sorted.length - 1]!.day}T00:00:00Z`).getTime();
  for (let t = new Date(`${sorted[0]!.day}T00:00:00Z`).getTime(); t <= end; t += 86400000) {
    const k = new Date(t).toISOString().slice(0, 10);
    out.push({ day: k, bits: map.get(k) ?? emptyDay() });
  }
  return out;
}

/**
 * COLLECTIVE: a start every one of `hostCount` hosts can take (a host without
 * cache = busy). Otherwise: a start at least one host can take on their own.
 */
export function mergeHostStarts(
  byHost: Map<number, HostDay[]>,
  hostCount: number,
  collective: boolean,
  rules: EventTypeRules,
  now: Date,
  constraints: Map<number, HostConstraint[]> = new Map(),
): Date[] {
  const perHost: Set<number>[] = [];
  for (let ordinal = 1; ordinal <= hostCount; ordinal++) {
    const days = contiguousDays(byHost.get(ordinal) ?? []);
    const starts = applyHostConstraints(bookableStarts(days, rules, now), constraints.get(ordinal) ?? [], rules);
    perHost.push(new Set(starts.map((d) => d.getTime())));
  }
  if (!perHost.length) return [];
  let result: Set<number>;
  if (collective) {
    result = new Set([...perHost[0]!].filter((t) => perHost.every((s) => s.has(t))));
  } else {
    result = new Set(perHost.flatMap((s) => [...s]));
  }
  return [...result].sort((a, b) => a - b).map((t) => new Date(t));
}

/**
 * A business-day window needs that many calendar days cached: n working days
 * span at most ceil(n·7/5) + 2 calendar days (a weekend on each side).
 * The stored max-days-ahead is raised to cover it, never above 365.
 */
export function effectiveMaxDaysAhead(maxDaysAhead: number, horizonBusinessDays: number | null): number {
  if (horizonBusinessDays == null) return maxDaysAhead;
  return Math.min(365, Math.max(maxDaysAhead, Math.ceil((horizonBusinessDays * 7) / 5) + 2));
}
