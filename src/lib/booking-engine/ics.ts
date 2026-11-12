/** RFC 5545 invite generation (UTC only, CRLF, folded at 75 octets). */

export interface IcsInvite {
  uid: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  startUtc: Date;
  endUtc: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizerEmail: string;
  organizerName?: string;
  attendeeEmail: string;
  attendeeName?: string;
  now?: Date;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const param = (s: string) => `"${s.replace(/["\r\n]/g, "")}"`;

function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curLen + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(i: IcsInvite): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ROUT//Booking Engine//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.method}`,
    "BEGIN:VEVENT",
    `UID:${i.uid}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${stamp(i.now ?? new Date())}`,
    `DTSTART:${stamp(i.startUtc)}`,
    `DTEND:${stamp(i.endUtc)}`,
    `SUMMARY:${escapeText(i.summary)}`,
    ...(i.description ? [`DESCRIPTION:${escapeText(i.description)}`] : []),
    ...(i.location ? [`LOCATION:${escapeText(i.location)}`] : []),
    ...(i.url ? [`URL:${i.url}`] : []),
    `ORGANIZER;CN=${param(i.organizerName ?? "ROUT")}:mailto:${i.organizerEmail}`,
    `ATTENDEE;CN=${param(i.attendeeName ?? i.attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${i.attendeeEmail}`,
    `STATUS:${i.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
