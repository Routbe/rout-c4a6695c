/**
 * The one door between external calendars and our database. Whatever an adapter
 * parses, only {hashed id, start, end, blocking} leaves this function; titles,
 * descriptions, attendees and the raw external id are dropped here.
 */
import type { BusyBlock } from "../types";

export interface RawExternalEvent {
  externalId: string;
  startUtc: Date;
  endUtc: Date;
  transparent?: boolean; // TRANSP:TRANSPARENT / showAs=free
  cancelled?: boolean;
  [other: string]: unknown; // adapters may carry anything; it never passes
}

async function hmacHex(key: string, value: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** `scope` (calendar id) is mixed in so equal external ids in two calendars never correlate. */
export async function toBusyBlocks(raw: RawExternalEvent[], hmacKey: string, scope: string): Promise<BusyBlock[]> {
  const out: BusyBlock[] = [];
  for (const e of raw) {
    if (e.cancelled) continue;
    if (!(e.startUtc instanceof Date) || !(e.endUtc instanceof Date)) continue;
    if (!(e.endUtc > e.startUtc)) continue;
    out.push({
      providerId: await hmacHex(hmacKey, `${scope}:${e.externalId}:${e.startUtc.toISOString()}`),
      startUtc: new Date(e.startUtc.getTime()),
      endUtc: new Date(e.endUtc.getTime()),
      isBlocking: !e.transparent,
    });
  }
  return out;
}
