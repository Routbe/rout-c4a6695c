/** Network side of the ICS and CalDAV adapters. https only, public hosts only, size-capped. */
import { isPublicHost } from "@/lib/open-web-rules";
import { validateOutboundUrl } from "@/lib/security/ssrf-guard.server";
import { parseIcsBusy } from "./ics-parse";
import type { RawExternalEvent } from "./zero-knowledge";

const MAX_BYTES = 5 * 1024 * 1024;

export class CalendarFetchError extends Error {
  constructor(public code: "invalid_url" | "http_error" | "too_large" | "auth_failed" | "network") {
    super(code);
  }
}

/** Syntactic gate: https, port 443, no userinfo, a public DNS name (no literal IPs, no internal suffixes). */
export function checkCalendarUrlShape(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim().replace(/^webcal:/i, "https:")); } catch { throw new CalendarFetchError("invalid_url"); }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443") || !isPublicHost(u.hostname)) {
    throw new CalendarFetchError("invalid_url");
  }
  return u;
}

/**
 * Full outbound gate, run before persisting a calendar AND before every fetch:
 * the shape check plus the shared SSRF guard, which resolves the name and
 * refuses loopback, private, link-local, CGNAT and metadata addresses.
 */
export async function assertCalendarUrl(raw: string): Promise<URL> {
  const u = checkCalendarUrlShape(raw);
  try {
    return await validateOutboundUrl(u.toString());
  } catch {
    throw new CalendarFetchError("invalid_url");
  }
}

async function readCapped(res: Response): Promise<string> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new CalendarFetchError("too_large");
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new CalendarFetchError("too_large"); }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(buf);
}

export async function fetchIcsFeed(url: string, from: Date, to: Date, etag?: string | null) {
  const u = await assertCalendarUrl(url);
  let res: Response;
  try {
    res = await fetch(u, { redirect: "error", headers: { Accept: "text/calendar", ...(etag ? { "If-None-Match": etag } : {}) }, signal: AbortSignal.timeout(15000) });
  } catch { throw new CalendarFetchError("network"); }
  if (res.status === 304) return { notModified: true as const, etag: etag ?? null };
  if (!res.ok) throw new CalendarFetchError("http_error");
  const events: RawExternalEvent[] = parseIcsBusy(await readCapped(res), from, to);
  return { notModified: false as const, events, etag: res.headers.get("etag") };
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** CalDAV calendar-query REPORT for a time range; the server expands recurrences. */
export function caldavReportBody(from: Date, to: Date): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data><c:expand start="${icsStamp(from)}" end="${icsStamp(to)}"/></c:calendar-data></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${icsStamp(from)}" end="${icsStamp(to)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
}

/** Pull each <calendar-data> payload out of a multistatus response. */
export function extractCalendarData(xml: string): string[] {
  const out: string[] = [];
  const re = /<(?:[a-z0-9]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?calendar-data>/gi;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    out.push((m[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"));
  }
  return out;
}

export async function fetchCaldav(creds: { url: string; username: string; password: string }, from: Date, to: Date) {
  const u = await assertCalendarUrl(creds.url);
  let res: Response;
  try {
    res = await fetch(u, {
      method: "REPORT",
      redirect: "error",
      headers: {
        Authorization: `Basic ${btoa(`${creds.username}:${creds.password}`)}`,
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: caldavReportBody(from, to),
      signal: AbortSignal.timeout(20000),
    });
  } catch { throw new CalendarFetchError("network"); }
  if (res.status === 401 || res.status === 403) throw new CalendarFetchError("auth_failed");
  if (res.status !== 207 && !res.ok) throw new CalendarFetchError("http_error");
  const events: RawExternalEvent[] = [];
  for (const ics of extractCalendarData(await readCapped(res))) events.push(...parseIcsBusy(ics, from, to));
  return { events };
}
