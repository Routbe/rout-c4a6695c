/**
 * Native ROUT booking component (`booking_request`).
 *
 * Client-safe: config parsing, slot presets and .ics generation live here so
 * both the Studio panel, the public card and the server workflow share one
 * source of truth. No server-only imports.
 */

export const BOOKING_DURATIONS = [15, 30, 45, 60] as const;
export type BookingDuration = (typeof BOOKING_DURATIONS)[number];

/** Vaste tijdsloten die de bezoeker kan kiezen. */
export const BOOKING_TIME_SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
] as const;

export type BookingMode = "direct" | "embed";

export interface BookingConfig {
  /** Titel op de knop/kaart. */
  title: string;
  /** Korte uitleg boven het formulier. */
  note: string;
  duration: BookingDuration;
  mode: BookingMode;
  /** Cal.com / Google Calendar URL (alleen in embed-modus). */
  embedUrl: string;
  /** Opt-in cached availability on the public profile. */
  showSlots: boolean;
  eventTypeId: string | null;
}

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  title: "Plan een afspraak / gesprek",
  note: "Kies een datum en tijdstip voor een korte kennismaking",
  duration: 30,
  mode: "direct",
  embedUrl: "",
  showSlots: false,
  eventTypeId: null,
};

export const BOOKING_MESSAGE_MAX = 500;

function asDuration(value: unknown): BookingDuration {
  const n = Number(value);
  return (BOOKING_DURATIONS as readonly number[]).includes(n)
    ? (n as BookingDuration)
    : DEFAULT_BOOKING_CONFIG.duration;
}

/** Leest de blokwaarde (JSON) uit; valt terug op de standaardconfiguratie. */
export function parseBookingConfig(value: string | null | undefined): BookingConfig {
  const raw = (value ?? "").trim();
  if (!raw) return { ...DEFAULT_BOOKING_CONFIG };
  if (!raw.startsWith("{")) {
    // Oudere blokken bewaarden alleen een agenda-URL.
    return { ...DEFAULT_BOOKING_CONFIG, mode: "embed", embedUrl: raw };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BookingConfig>;
    return {
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : DEFAULT_BOOKING_CONFIG.title,
      note: typeof parsed.note === "string" ? parsed.note : DEFAULT_BOOKING_CONFIG.note,
      duration: asDuration(parsed.duration),
      mode: parsed.mode === "embed" ? "embed" : "direct",
      embedUrl: typeof parsed.embedUrl === "string" ? parsed.embedUrl.trim() : "",
      showSlots: parsed.showSlots === true,
      eventTypeId: typeof parsed.eventTypeId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.eventTypeId) ? parsed.eventTypeId : null,
    };
  } catch {
    return { ...DEFAULT_BOOKING_CONFIG };
  }
}

export function serializeBookingConfig(config: BookingConfig): string {
  return JSON.stringify(config);
}

/** ISO-datum (YYYY-MM-DD) van vandaag — ondergrens voor de datumkiezer. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isFutureDate(date: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayIso(now);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYYMMDDTHHMMSSZ` in UTC, uitgaande van een lokale Brusselse invoer. */
function icsStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export interface IcsInput {
  uid: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMinutes: number;
  guestName: string;
  guestEmail: string;
  hostEmail: string;
  description?: string;
}

/** Bouwt een geldig VCALENDAR-bestand voor de bevestigde afspraak. */
export function buildIcs(input: IcsInput): string {
  const start = new Date(`${input.date}T${input.time}:00Z`);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ROUT//Booking//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${input.uid}@rout.be`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${escapeIcs(input.title)}`,
    `DESCRIPTION:${escapeIcs(input.description ?? "")}`,
    `ORGANIZER;CN=ROUT:mailto:${input.hostEmail}`,
    `ATTENDEE;CN=${escapeIcs(input.guestName)};RSVP=TRUE:mailto:${input.guestEmail}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** "Toevoegen aan Google Calendar"-link voor de bevestigingsmail. */
export function googleCalendarUrl(input: IcsInput): string {
  const start = new Date(`${input.date}T${input.time}:00Z`);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${icsStamp(start)}/${icsStamp(end)}`,
    details: input.description ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
