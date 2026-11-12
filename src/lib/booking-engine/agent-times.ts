/**
 * MCP `rout_find_booking_times`: shapes the public slot list for an AI agent.
 * Pure (no DB): the server passes in slots it already computed for visitors,
 * so an agent sees exactly what the booking page offers and nothing more.
 * Booking stays a human action on `booking_url`.
 */
import { addDays, canonicalZone, groupSlotsByDay, isValidTimeZone, localDayKey } from "./guest-view-rules";

export const AGENT_MAX_DAYS = 14;
export const AGENT_MAX_TIMES = 60;

export type AgentTimesInput = {
  slots: readonly string[];
  timeZone?: unknown;
  fromDate?: unknown;
  days?: unknown;
  now: Date;
  bookingPage: string;
};

export type AgentTimesResult =
  | { ok: false; error: "invalid_time_zone" | "invalid_from_date" | "invalid_days" }
  | {
      ok: true;
      time_zone: string;
      from_date: string;
      to_date: string;
      days: { date: string; times: { start_utc: string; local_time: string; booking_url: string }[] }[];
      truncated: boolean;
    };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function realDay(v: string): boolean {
  if (!DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const timeFmt = new Map<string, Intl.DateTimeFormat>();
function localTime(iso: string, tz: string): string {
  let f = timeFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    timeFmt.set(tz, f);
  }
  return f.format(new Date(iso));
}

export function agentBookingTimes(input: AgentTimesInput): AgentTimesResult {
  const rawTz = input.timeZone ?? "UTC";
  if (!isValidTimeZone(rawTz)) return { ok: false, error: "invalid_time_zone" };
  const tz = canonicalZone(rawTz);

  const today = localDayKey(input.now.toISOString(), tz);
  let from = today;
  if (input.fromDate !== undefined) {
    if (typeof input.fromDate !== "string" || !realDay(input.fromDate)) return { ok: false, error: "invalid_from_date" };
    from = input.fromDate < today ? today : input.fromDate;
  }

  let days = 7;
  if (input.days !== undefined) {
    if (typeof input.days !== "number" || !Number.isInteger(input.days) || input.days < 1 || input.days > AGENT_MAX_DAYS) {
      return { ok: false, error: "invalid_days" };
    }
    days = input.days;
  }
  const to = addDays(from, days - 1);

  const out: { date: string; times: { start_utc: string; local_time: string; booking_url: string }[] }[] = [];
  let count = 0;
  let truncated = false;
  for (const [date, list] of groupSlotsByDay(input.slots, tz)) {
    if (date < from || date > to) continue;
    const times: { start_utc: string; local_time: string; booking_url: string }[] = [];
    for (const s of list) {
      if (count >= AGENT_MAX_TIMES) {
        truncated = true;
        break;
      }
      const start = new Date(s).toISOString();
      times.push({ start_utc: start, local_time: localTime(start, tz), booking_url: `${input.bookingPage}?start=${encodeURIComponent(start)}` });
      count++;
    }
    if (times.length) out.push({ date, times });
    if (truncated) break;
  }
  return { ok: true, time_zone: tz, from_date: from, to_date: to, days: out, truncated };
}
