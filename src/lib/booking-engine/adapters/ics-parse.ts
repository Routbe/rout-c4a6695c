/**
 * Busy-only iCalendar reader. Reads only UID, DTSTART, DTEND/DURATION, TRANSP,
 * STATUS, RRULE (full RFC 5545 via `rrule`), EXDATE and RECURRENCE-ID.
 * SUMMARY, DESCRIPTION, ATTENDEE, LOCATION … are never even extracted.
 *
 * Recurrences expand on the event's own wall clock (TZID), and each occurrence
 * is then converted to UTC on its own date, so a weekly 10:00 meeting stays at
 * 10:00 local across summer/winter time instead of drifting by an hour.
 */
import { RRule } from "rrule";
import { addMinutes, wallParts, zonedToUtc } from "../time";
import type { RawExternalEvent } from "./zero-knowledge";

const READ = new Set(["UID", "DTSTART", "DTEND", "DURATION", "TRANSP", "STATUS", "RRULE", "EXDATE", "RECURRENCE-ID"]);
const MAX_OCCURRENCES = 2000;

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]|\n[ \t]/g, "").split(/\r?\n/);
}

/** Parse a DATE or DATE-TIME value with optional TZID into UTC. Floating times use `fallbackTz`. */
export function parseIcsDate(value: string, params: Record<string, string>, fallbackTz: string): { at: Date; allDay: boolean } | null {
  const v = value.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || params["VALUE"] === "DATE") {
    m = m ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { at: zonedToUtc(+m[1]!, +m[2]!, +m[3]!, 0, params["TZID"] ?? fallbackTz), allDay: true };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  if (m[7] === "Z") return { at: new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)), allDay: false };
  const tz = params["TZID"] ?? fallbackTz;
  try {
    return { at: new Date(zonedToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]! * 60 + +m[5]!, tz).getTime() + +m[6]! * 1000), allDay: false };
  } catch {
    return { at: new Date(zonedToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]! * 60 + +m[5]!, "UTC").getTime()), allDay: false };
  }
}

function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const mins = (+(m[2] ?? 0)) * 10080 + (+(m[3] ?? 0)) * 1440 + (+(m[4] ?? 0)) * 60 + (+(m[5] ?? 0)) + (+(m[6] ?? 0)) / 60;
  return m[1] === "-" ? -mins : mins;
}

type Prop = { name: string; params: Record<string, string>; value: string };
function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: (name ?? "").toUpperCase(), params, value: line.slice(colon + 1) };
}

type Wall = { year: number; month: number; day: number; minute: number; second: number };

/** DTSTART as wall time in its zone (UTC "Z" values use the zone "UTC"). */
function wallOf(value: string, params: Record<string, string>, fallbackTz: string): { wall: Wall; tz: string } | null {
  const v = value.trim();
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (d) return { wall: { year: +d[1]!, month: +d[2]!, day: +d[3]!, minute: 0, second: 0 }, tz: params["TZID"] ?? fallbackTz };
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  return {
    wall: { year: +m[1]!, month: +m[2]!, day: +m[3]!, minute: +m[4]! * 60 + +m[5]!, second: +m[6]! },
    tz: m[7] === "Z" ? "UTC" : params["TZID"] ?? fallbackTz,
  };
}

function safeZone(tz: string): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "UTC"; }
}

/**
 * Occurrences of RRULE in real UTC. The rule runs on "floating" dates (wall
 * time written as if it were UTC) and each hit is mapped through the zone.
 * UNTIL is applied on real instants afterwards, because rrule would compare a
 * UTC UNTIL against floating dates.
 */
function expand(dt: { wall: Wall; tz: string }, rrule: string, windowStart: Date, windowEnd: Date, exdates: Set<number>, lengthMin: number): Date[] {
  const tz = safeZone(dt.tz);
  const parts = Object.fromEntries(rrule.split(";").map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i).toUpperCase(), kv.slice(i + 1)]; }));
  const untilRaw = parts["UNTIL"];
  delete parts["UNTIL"];
  const until = untilRaw ? parseIcsDate(untilRaw, {}, tz)?.at ?? null : null;
  const floatingStart = new Date(Date.UTC(dt.wall.year, dt.wall.month - 1, dt.wall.day, 0, dt.wall.minute, dt.wall.second));
  let rule: RRule;
  try {
    const options = RRule.parseString(Object.entries(parts).map(([k, v]) => `${k}=${v}`).join(";"));
    rule = new RRule({ ...options, dtstart: floatingStart, tzid: null });
  } catch {
    return [];
  }
  // Floating window with a day of margin each side plus the event length.
  const from = new Date(windowStart.getTime() - 86400000 - lengthMin * 60000);
  const to = new Date(windowEnd.getTime() + 86400000);
  const out: Date[] = [];
  rule.between(from, to, true, (occ) => {
    const real = zonedToUtc(occ.getUTCFullYear(), occ.getUTCMonth() + 1, occ.getUTCDate(), occ.getUTCHours() * 60 + occ.getUTCMinutes(), tz);
    const at = new Date(real.getTime() + occ.getUTCSeconds() * 1000);
    if (until && at > until) return false;
    if (!exdates.has(at.getTime())) out.push(at);
    return out.length < MAX_OCCURRENCES;
  });
  return out;
}

/** Busy-only events overlapping [windowStart, windowEnd). */
export function parseIcsBusy(text: string, windowStart: Date, windowEnd: Date, fallbackTz = "UTC"): RawExternalEvent[] {
  const events: Prop[][] = [];
  let cur: Prop[] | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line)) { cur = []; depth = 0; continue; }
    if (cur && /^BEGIN:/i.test(line)) { depth++; continue; } // VALARM etc.
    if (cur && /^END:/i.test(line) && depth > 0) { depth--; continue; }
    if (/^END:VEVENT$/i.test(line) && cur) { events.push(cur); cur = null; continue; }
    if (cur && depth === 0) {
      const p = parseLine(line);
      if (p && READ.has(p.name)) cur.push(p);
    }
  }

  // RECURRENCE-ID instances replace that occurrence of their series (same UID).
  const overridden = new Map<string, Set<number>>();
  for (const ev of events) {
    const rid = ev.find((p) => p.name === "RECURRENCE-ID");
    const uid = ev.find((p) => p.name === "UID")?.value;
    if (!rid || !uid) continue;
    const at = parseIcsDate(rid.value, rid.params, fallbackTz)?.at;
    if (!at) continue;
    if (!overridden.has(uid)) overridden.set(uid, new Set());
    overridden.get(uid)!.add(at.getTime());
  }

  const out: RawExternalEvent[] = [];
  for (const ev of events) {
    const get = (n: string) => ev.find((p) => p.name === n);
    const ds = get("DTSTART");
    const start = ds ? parseIcsDate(ds.value, ds.params, fallbackTz) : null;
    if (!start || !ds) continue;
    const de = get("DTEND");
    const dur = get("DURATION");
    let lengthMin: number;
    if (de) {
      const e = parseIcsDate(de.value, de.params, fallbackTz);
      lengthMin = e ? (e.at.getTime() - start.at.getTime()) / 60000 : 0;
    } else if (dur) lengthMin = parseDuration(dur.value) ?? 0;
    else lengthMin = start.allDay ? 1440 : 0;
    if (lengthMin <= 0) continue;
    const uid = get("UID")?.value ?? `${start.at.getTime()}`;
    const exdates = new Set<number>(overridden.get(uid) && !get("RECURRENCE-ID") ? overridden.get(uid) : []);
    for (const p of ev.filter((p) => p.name === "EXDATE"))
      for (const v of p.value.split(",")) { const x = parseIcsDate(v, p.params, fallbackTz); if (x) exdates.add(x.at.getTime()); }
    const rr = get("RRULE");
    const wall = rr ? wallOf(ds.value, ds.params, fallbackTz) : null;
    const starts = rr && wall ? expand(wall, rr.value, windowStart, windowEnd, exdates, lengthMin) : [start.at];
    const transparent = get("TRANSP")?.value.trim().toUpperCase() === "TRANSPARENT";
    const cancelled = get("STATUS")?.value.trim().toUpperCase() === "CANCELLED";
    for (const s of starts) {
      // All-day events last one local day each, even on a 23- or 25-hour DST day.
      let e = addMinutes(s, lengthMin);
      if (start.allDay && rr && wall) {
        const w = wallParts(s, safeZone(wall.tz));
        const days = Math.round(lengthMin / 1440);
        e = zonedToUtc(w.year, w.month, w.day + days, 0, safeZone(wall.tz));
      }
      if (e > windowStart && s < windowEnd) out.push({ externalId: uid, startUtc: s, endUtc: e, transparent, cancelled });
    }
  }
  return out;
}
