/**
 * Pure helpers for the guest booking page (phase 7): slots per day in the
 * visitor's chosen zone, the month grid, 12/24-hour display and the time-zone
 * list. No React, no network — everything here is unit-tested.
 */

export type HourCycle = "h12" | "h23";
export type DayPeriod = "morning" | "afternoon" | "evening";
export type GridCell = { day: string; inMonth: boolean };
export type ZoneOption = {
  id: string;
  city: string;
  region: string;
  offsetMinutes: number;
  offsetLabel: string;
};

const dayFmt = new Map<string, Intl.DateTimeFormat>();
/** Day key (YYYY-MM-DD) of an instant on the wall clock of `tz`. */
export function localDayKey(iso: string, tz: string): string {
  let f = dayFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFmt.set(tz, f);
  }
  return f.format(new Date(iso));
}

/** Slots grouped per local day, days and times in chronological order. */
export function groupSlotsByDay(slots: readonly string[], tz: string): Map<string, string[]> {
  const sorted = [...slots].sort((a, b) => Date.parse(a) - Date.parse(b));
  const out = new Map<string, string[]>();
  for (const s of sorted) {
    const k = localDayKey(s, tz);
    const list = out.get(k);
    if (list) list.push(s);
    else out.set(k, [s]);
  }
  return out;
}

const hourFmt = new Map<string, Intl.DateTimeFormat>();
/** Morning before 12:00, afternoon before 17:00, evening after — on the visitor's wall clock. */
export function dayPeriod(iso: string, tz: string): DayPeriod {
  let f = hourFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" });
    hourFmt.set(tz, f);
  }
  const h = Number(f.format(new Date(iso))) % 24;
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

/** Times of one day split into morning / afternoon / evening, empty groups left out. */
export function groupByPeriod(
  slots: readonly string[],
  tz: string,
): { period: DayPeriod; slots: string[] }[] {
  const order: DayPeriod[] = ["morning", "afternoon", "evening"];
  const m = new Map<DayPeriod, string[]>();
  for (const s of slots) {
    const p = dayPeriod(s, tz);
    m.set(p, [...(m.get(p) ?? []), s]);
  }
  return order.filter((p) => m.has(p)).map((period) => ({ period, slots: m.get(period)! }));
}

/** The locale's own clock (en-US → 12 h, nl/fr/de → 24 h). */
export function defaultHourCycle(locale: string): HourCycle {
  try {
    const hc = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
    return hc === "h12" || hc === "h11" ? "h12" : "h23";
  } catch {
    return "h23";
  }
}

/** 24 h keeps two digits (09:30) so columns align; 12 h drops the leading zero (9:30 AM) as clocks do. */
export function formatSlotTime(
  iso: string,
  locale: string,
  tz: string,
  hourCycle: HourCycle,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: hourCycle === "h12" ? "numeric" : "2-digit",
    minute: "2-digit",
    hourCycle,
    timeZone: tz,
  }).format(new Date(iso));
}

/** Monday for the European locales; a locale that reports another first day (e.g. en-US) keeps it. */
export function weekStartFor(locale: string): 0 | 1 {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const first = l.getWeekInfo?.().firstDay ?? l.weekInfo?.firstDay;
    if (first === 7) return 0;
    if (first === 1) return 1;
  } catch {
    /* fall through */
  }
  return /^en-US$/i.test(locale) ? 0 : 1;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const monthKey = (day: string) => day.slice(0, 7);

/** Whole weeks covering `month` (YYYY-MM), starting on `weekStart` (0 = Sunday, 1 = Monday). */
export function monthGrid(month: string, weekStart: 0 | 1): GridCell[][] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks: GridCell[][] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(y, m - 1, 1 - lead + i));
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1]!.push({ day, inMonth: d.getUTCMonth() === m - 1 });
  }
  return weeks;
}

/** Every month from the first to the last day key (inclusive), for month navigation. */
export function monthsBetween(firstDay: string, lastDay: string): string[] {
  const out: string[] = [];
  let [y, m] = monthKey(firstDay).split("-").map(Number) as [number, number];
  const end = monthKey(lastDay);
  for (let guard = 0; guard < 240; guard++) {
    const k = `${y}-${pad(m)}`;
    out.push(k);
    if (k >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Day key shifted by `n` calendar days (keyboard navigation in the grid). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "GMT", "GMT+1", "GMT-3:30", "GMT+5:45". */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return "GMT";
  const sign = minutes > 0 ? "+" : "-";
  const a = Math.abs(minutes);
  const h = Math.floor(a / 60),
    m = a % 60;
  return `GMT${sign}${h}${m ? `:${pad(m)}` : ""}`;
}

/** Offset of `tz` at `at`, in minutes east of UTC. */
export function zoneOffset(tz: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]) % 24,
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

const FALLBACK_ZONES = [
  "UTC",
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Casablanca",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Halifax",
  "America/St_Johns",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Mexico_City",
  "America/Bogota",
];

/** Current names for the legacy ids some engines still return (ICU keeps the 1990s spellings). */
const MODERN_ZONE: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Europe/Kiev": "Europe/Kyiv",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "America/Godthab": "America/Nuuk",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Enderbury": "Pacific/Kanton",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
  GMT: "UTC",
  "Etc/Universal": "UTC",
  "Etc/Zulu": "UTC",
};
/** The modern spelling of a zone when this runtime accepts it, else the id as given. */
export function canonicalZone(id: string): string {
  const m = MODERN_ZONE[id];
  return m && isValidTimeZone(m) ? m : id;
}

function cityOf(id: string): { city: string; region: string } {
  const parts = id.split("/");
  return {
    city: (parts[parts.length - 1] ?? id).replace(/_/g, " "),
    region: parts.length > 1 ? parts[0]! : "",
  };
}

/**
 * Every IANA zone the browser knows (or a broad fallback), with its offset at
 * `at`, sorted by offset then city. The visitor's own and the host-relevant
 * `extra` zones are always included, even when the runtime list misses them.
 */
export function timezoneOptions(at: Date, extra: readonly string[] = []): ZoneOption[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
    .supportedValuesOf;
  let ids: string[];
  try {
    ids = supported ? supported("timeZone") : FALLBACK_ZONES;
  } catch {
    ids = FALLBACK_ZONES;
  }
  const all = new Set<string>(["UTC", ...ids, ...extra.filter(isValidTimeZone)].map(canonicalZone));
  return [...all]
    .map((id) => {
      const offsetMinutes = zoneOffset(id, at);
      return { id, ...cityOf(id), offsetMinutes, offsetLabel: formatOffset(offsetMinutes) };
    })
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.city.localeCompare(b.city));
}

/** Case- and accent-insensitive match on city, region, full id or offset ("brus", "gmt+1", "new york"). */
export function matchesZone(option: ZoneOption, query: string): boolean {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[_\s]+/g, " ")
      .trim();
  const q = norm(query);
  if (!q) return true;
  return [
    option.city,
    option.region,
    option.id,
    option.offsetLabel,
    `utc${option.offsetLabel.slice(3)}`,
  ].some((f) => norm(f).includes(q));
}
