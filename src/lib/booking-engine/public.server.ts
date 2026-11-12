/**
 * Visitor-facing reads. Guests have no session, so every read goes through the
 * narrow SECURITY DEFINER functions of db/0216; rout_app's RLS stays closed.
 */
import { sql, withDbContext } from "@/lib/neon";
import type { EventTypeRules } from "./types";
import { intakeFields } from "./intake";
import { mergeHostStarts, type HostConstraint, type HostDay } from "./slot-rules";

type PublicEventTypeRow = {
  id: string; title: string; description: string | null; durationMinutes: number; priceCents: number | null;
  currency: string; locationKind: "video" | "address" | "phone"; confirmationMode: "instant" | "request";
  routingStrategy: EventTypeRules["routingStrategy"]; minimumNoticeHours: number; maxDaysAhead: number;
  slotStepMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number; workspaceId: string | null;
  customFields: unknown; capacity: number; hostName: string | null; hostCount: number;
  // db/0218 (absent before that migration; `phase` tells the two apart).
  adjacentOnly?: boolean; horizonBusinessDays?: number | null; horizonEndUtc?: string | null; holdMinutes?: number; phase?: number;
};

export async function publicEventType(id: string) {
  const rows = (await sql`select public.rout_booking_public_event_type(${id}::uuid) as r`) as { r: PublicEventTypeRow | null }[];
  const r = rows[0]?.r;
  if (!r) return null;
  return {
    id: r.id, title: r.title, description: r.description ?? null,
    durationMinutes: Number(r.durationMinutes), priceCents: r.priceCents == null ? null : Number(r.priceCents),
    currency: r.currency, locationKind: r.locationKind, confirmationMode: r.confirmationMode,
    hostName: r.hostName ?? null, customFields: intakeFields.safeParse(r.customFields ?? []).data ?? [],
    capacity: Number(r.capacity ?? 1), hostCount: Number(r.hostCount ?? 0),
    /** Soft-locks exist (db/0218): the guest page reserves a clicked slot for this many minutes. */
    holdMinutes: r.phase === 2 ? Number(r.holdMinutes ?? 5) : null,
    horizonBusinessDays: r.horizonBusinessDays == null ? null : Number(r.horizonBusinessDays),
    rules: {
      id: r.id, workspaceId: r.workspaceId ?? null, durationMinutes: Number(r.durationMinutes),
      bufferBeforeMinutes: Number(r.bufferBeforeMinutes), bufferAfterMinutes: Number(r.bufferAfterMinutes),
      minimumNoticeHours: Number(r.minimumNoticeHours), maxDaysAhead: Number(r.maxDaysAhead),
      slotStepMinutes: Number(r.slotStepMinutes), routingStrategy: r.routingStrategy,
      confirmationMode: r.confirmationMode, priceCents: r.priceCents == null ? null : Number(r.priceCents),
      currency: r.currency, title: r.title, locationKind: r.locationKind, locationValue: null,
      adjacentOnly: Boolean(r.adjacentOnly), horizonEndUtc: r.horizonEndUtc ? new Date(r.horizonEndUtc) : null,
    } satisfies EventTypeRules,
  };
}

/**
 * Free starts (UTC ISO) for the horizon. Each host is evaluated on their own
 * timeline; COLLECTIVE keeps starts every host can take, otherwise any one host.
 * Other visitors' holds and full limit periods are removed per host; the
 * visitor's own hold (`holdId`) stays visible to them.
 */
export async function publicSlots(id: string, now = new Date(), holdId: string | null = null): Promise<string[]> {
  const et = await publicEventType(id);
  if (!et || et.hostCount === 0) return [];
  await refreshStaleHosts(id, now);
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + (et.rules.maxDaysAhead + 1) * 86400000).toISOString().slice(0, 10);
  const rows = (await sql`select host_ordinal, day::text as day, bits from public.rout_booking_public_days(${id}::uuid, ${from}::date, ${to}::date)`) as
    { host_ordinal: number; day: string; bits: string }[];
  const byHost = new Map<number, HostDay[]>();
  for (const r of rows) {
    const k = Number(r.host_ordinal);
    if (!byHost.has(k)) byHost.set(k, []);
    byHost.get(k)!.push({ day: r.day, bits: r.bits });
  }
  const constraints = et.holdMinutes != null ? await publicConstraints(id, now, et.rules.maxDaysAhead, holdId) : new Map<number, HostConstraint[]>();
  if (et.holdMinutes != null && (await hasSessions())) {
    for (const [k, list] of await publicSessions(id, now, et.rules.maxDaysAhead, holdId)) {
      constraints.set(k, [...(constraints.get(k) ?? []), ...list]);
    }
  }
  return mergeHostStarts(byHost, et.hostCount, et.rules.routingStrategy === "COLLECTIVE", et.rules, now, constraints).map((d) => d.toISOString());
}

async function publicConstraints(id: string, now: Date, maxDaysAhead: number, holdId: string | null) {
  const to = new Date(now.getTime() + (maxDaysAhead + 1) * 86400000).toISOString();
  const rows = (await sql`select host_ordinal, kind, start_utc, end_utc
    from public.rout_booking_public_constraints(${id}::uuid, ${now.toISOString()}::timestamptz, ${to}::timestamptz, ${holdId}::uuid)`) as
    { host_ordinal: number; kind: string; start_utc: string; end_utc: string }[];
  const out = new Map<number, HostConstraint[]>();
  for (const r of rows) {
    if (r.kind !== "busy" && r.kind !== "limit") continue;
    const k = Number(r.host_ordinal);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ kind: r.kind, startUtc: new Date(r.start_utc), endUtc: new Date(r.end_utc) });
  }
  return out;
}

/** db/0219 is applied (cached 60 s), so the slot list never calls a function that does not exist yet. */
let sessionsProbe: { ok: boolean; at: number } | null = null;
async function hasSessions(): Promise<boolean> {
  if (sessionsProbe && Date.now() - sessionsProbe.at < 60_000) return sessionsProbe.ok;
  const rows = (await sql`select to_regprocedure('public.rout_booking_public_sessions(uuid, timestamptz, timestamptz, uuid)') is not null as ok`) as { ok: boolean }[];
  sessionsProbe = { ok: Boolean(rows[0]?.ok), at: Date.now() };
  return sessionsProbe.ok;
}

/** Group sessions of every host (db/0219): blocks to avoid, and whether the exact start still has a seat. */
async function publicSessions(id: string, now: Date, maxDaysAhead: number, holdId: string | null) {
  const to = new Date(now.getTime() + (maxDaysAhead + 1) * 86400000).toISOString();
  const rows = (await sql`select host_ordinal, start_utc, block_start_utc, block_end_utc, open
    from public.rout_booking_public_sessions(${id}::uuid, ${now.toISOString()}::timestamptz, ${to}::timestamptz, ${holdId}::uuid)`) as
    { host_ordinal: number; start_utc: string; block_start_utc: string; block_end_utc: string; open: boolean }[];
  const out = new Map<number, HostConstraint[]>();
  for (const r of rows) {
    const k = Number(r.host_ordinal);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ kind: "session", startUtc: new Date(r.block_start_utc), endUtc: new Date(r.block_end_utc),
      openStart: r.open ? new Date(r.start_utc) : null });
  }
  return out;
}

export type GuestView =
  | { id: string; status: string; masked: true }
  | {
      id: string; status: string; masked: false; title: string; startUtc: string; endUtc: string; guestName: string;
      guestEmail: string; guestTimezone: string; locationKind: string; locationValue: string | null; hostName: string | null;
      icsUid: string; sequence: number;
    };

/** Guest capability check in the database (db/0216): details only with the booking token. */
export async function guestView(id: string, token: string | null | undefined): Promise<GuestView | null> {
  const rows = (await sql`select public.rout_booking_guest_view(${id}::uuid, ${token ?? null}) as v`) as { v: GuestView | null }[];
  return rows[0]?.v ?? null;
}

/**
 * Confirmation view. The booking id alone is NOT a capability (db/0144):
 * without the token the response is masked to the status only.
 */
export async function bookingSummary(id: string, token?: string | null) {
  const v = await guestView(id, token);
  if (!v) return null;
  if (v.masked) {
    return { id: v.id, status: v.status, title: null, startUtc: null, endUtc: null, locationKind: null,
      guestName: null, guestTimezone: null, locationValue: null, masked: true as const };
  }
  return {
    id: v.id, status: v.status, title: v.title,
    startUtc: new Date(v.startUtc).toISOString(), endUtc: new Date(v.endUtc).toISOString(),
    locationKind: v.locationKind, masked: false as const, guestName: v.guestName,
    guestTimezone: v.guestTimezone, locationValue: v.locationValue ?? null,
  };
}

/** Lazy fallback: recompute hosts whose cache is missing or older than 5 minutes, each as that host. */
async function refreshStaleHosts(eventTypeId: string, now: Date): Promise<void> {
  try {
    const { LAZY_RECOMPUTE_MAX_HOSTS } = await import("./staleness");
    const rows = (await sql`select public.rout_booking_stale_hosts(${eventTypeId}::uuid, interval '5 minutes') as ids`) as { ids: string[] | null }[];
    const stale = (rows[0]?.ids ?? []).slice(0, LAZY_RECOMPUTE_MAX_HOSTS);
    if (!stale.length) return;
    const { recomputeUser } = await import("./recompute.server");
    await Promise.all(stale.map((hostId) => withDbContext({ userId: hostId, workspaceId: null }, () => recomputeUser(hostId, now)).catch((e) => {
      console.error("[booking] lazy recompute failed", e instanceof Error ? e.message : "unknown");
    })));
  } catch (e) {
    console.error("[booking] stale check failed", e instanceof Error ? e.message : "unknown");
  }
}

/** Smart widget: the first `n` open starts of an active type on a public profile (cache only, no guest data). */
export async function nextPublicSlots(handle: string, eventTypeId: string | null, n = 3) {
  const rows = (await sql`select id::text as id, title from public.rout_booking_public_type_for_handle(${handle}, ${eventTypeId}::uuid)`) as { id: string; title: string }[];
  const t = rows[0];
  if (!t) return null;
  return { eventTypeId: t.id, title: t.title, slots: (await publicSlots(t.id)).slice(0, Math.min(5, n)) };
}
