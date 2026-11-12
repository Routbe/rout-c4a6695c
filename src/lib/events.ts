/**
 * Configuratie van het `event_list`-blok (evenementen & agenda).
 * Client-safe: parsing, sortering en kalenderlinks (.ics / Google Calendar)
 * worden gedeeld door het Studio-paneel en de publieke kaart.
 */

export interface EventItem {
  title: string;
  /** ISO-datum `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM` starttijd. */
  time: string;
  venue: string;
  description: string;
  url: string;
  buttonLabel: string;
}

export interface EventListConfig {
  title: string;
  items: EventItem[];
  autoHidePast: boolean;
}

export const EVENTS_MAX = 12;

export const EMPTY_EVENT: EventItem = {
  title: "",
  date: "",
  time: "19:00",
  venue: "",
  description: "",
  url: "",
  buttonLabel: "Tickets",
};

export const DEFAULT_EVENT_LIST: EventListConfig = {
  title: "Aankomende evenementen",
  items: [{ ...EMPTY_EVENT }],
  autoHidePast: true,
};

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

export function parseEventListConfig(raw: string | undefined | null): EventListConfig {
  if (!raw || !raw.trim().startsWith("{"))
    return { ...DEFAULT_EVENT_LIST, items: [{ ...EMPTY_EVENT }] };
  try {
    const p = JSON.parse(raw) as Partial<EventListConfig>;
    const items = (Array.isArray(p.items) ? p.items : [])
      .filter((i) => !!i && typeof i === "object")
      .map((i) => i as Partial<EventItem>)
      .slice(0, EVENTS_MAX)
      .map((i) => ({
        title: str(i.title),
        date: /^\d{4}-\d{2}-\d{2}$/.test(str(i.date)) ? str(i.date) : "",
        time: /^\d{2}:\d{2}$/.test(str(i.time)) ? str(i.time) : "19:00",
        venue: str(i.venue),
        description: str(i.description),
        url: str(i.url),
        buttonLabel: str(i.buttonLabel, "Tickets") || "Tickets",
      }));
    return {
      title: str(p.title, DEFAULT_EVENT_LIST.title) || DEFAULT_EVENT_LIST.title,
      items: items.length ? items : [{ ...EMPTY_EVENT }],
      autoHidePast: p.autoHidePast !== false,
    };
  } catch {
    return { ...DEFAULT_EVENT_LIST, items: [{ ...EMPTY_EVENT }] };
  }
}

export function serializeEventListConfig(config: EventListConfig): string {
  return JSON.stringify({
    title: config.title.trim(),
    autoHidePast: config.autoHidePast,
    items: config.items.slice(0, EVENTS_MAX).map((i) => ({
      title: i.title.trim(),
      date: i.date,
      time: i.time,
      venue: i.venue.trim(),
      description: i.description.trim(),
      url: i.url.trim(),
      buttonLabel: i.buttonLabel.trim(),
    })),
  });
}

/** Alleen bruikbare items (titel + datum), gesorteerd, optioneel zonder verleden. */
export function visibleEvents(config: EventListConfig, now: Date = new Date()): EventItem[] {
  const today = now.toISOString().slice(0, 10);
  return config.items
    .filter((i) => i.title.trim() && i.date)
    .filter((i) => (config.autoHidePast ? i.date >= today : true))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

const MONTHS_NL = [
  "JAN",
  "FEB",
  "MRT",
  "APR",
  "MEI",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OKT",
  "NOV",
  "DEC",
];

/** Datumbadge: bovenaan de maand, onderaan de dag. */
export function eventDateBadge(date: string): { month: string; day: string } {
  const [y, m, d] = date.split("-");
  const idx = Number.parseInt(m ?? "1", 10) - 1;
  void y;
  return { month: MONTHS_NL[idx] ?? "", day: String(Number.parseInt(d ?? "1", 10)) };
}

function stamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

const escapeIcs = (v: string) => v.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

/** Eén VEVENT als .ics-tekst (duur standaard 2 uur). */
export function eventIcs(item: EventItem): string {
  const start = new Date(`${item.date}T${item.time || "19:00"}:00Z`);
  const end = new Date(start.getTime() + 2 * 60 * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ROUT//Events//NL",
    "BEGIN:VEVENT",
    `UID:${item.date}-${encodeURIComponent(item.title).slice(0, 40)}@rout.be`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeIcs(item.title)}`,
    `LOCATION:${escapeIcs(item.venue)}`,
    `DESCRIPTION:${escapeIcs(item.description || item.url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function eventIcsDataUrl(item: EventItem): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(eventIcs(item))}`;
}

export function eventGoogleUrl(item: EventItem): string {
  const start = new Date(`${item.date}T${item.time || "19:00"}:00Z`);
  const end = new Date(start.getTime() + 2 * 60 * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: item.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: item.description || item.url,
    location: item.venue,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
