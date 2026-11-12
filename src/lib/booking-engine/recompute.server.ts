/**
 * Worker side: sync calendars (zero-knowledge) and pre-compute free_bits per
 * user for as far ahead as their event types allow (30–366 days). Visitors only
 * ever read availability_cache. Every per-user step runs AS that user
 * (withDbContext), so cron work reads and writes through RLS like the owner.
 */
import { sql, withDbContext } from "@/lib/neon";
import { computeDays } from "./bitmap";
import { addMinutes, startOfUtcDay } from "./time";
import type { AvailabilityRule, UtcInterval } from "./types";

export const HORIZON_DAYS = 30;
export const MAX_HORIZON_DAYS = 366;

/** Cache horizon: the furthest an active type of this host can be booked, at least 30 days. */
export function horizonFor(maxDaysAhead: number[]): number {
  const furthest = Math.max(HORIZON_DAYS - 1, ...maxDaysAhead.filter((n) => Number.isFinite(n)));
  return Math.min(MAX_HORIZON_DAYS, furthest + 1);
}

async function hostHorizon(userId: string): Promise<number> {
  const rows = (await sql`select t.max_days_ahead from public.booking_event_types t
    where t.is_active and (t.user_id = ${userId}::uuid or exists (
      select 1 from public.booking_event_type_hosts h where h.event_type_id = t.id and h.user_id = ${userId}::uuid))`) as { max_days_ahead: number }[];
  return horizonFor(rows.map((r) => Number(r.max_days_ahead)));
}

export async function enqueueRecompute(userId: string, reason: string, delaySeconds = 20) {
  await sql`insert into public.availability_jobs (user_id, reason, run_after)
    values (${userId}::uuid, ${reason}, now() + make_interval(secs => ${delaySeconds}))
    on conflict (user_id) do update set reason = excluded.reason, run_after = least(public.availability_jobs.run_after, excluded.run_after)`;
}

const iv = (r: { s: string; e: string }): UtcInterval => ({ startUtc: new Date(r.s), endUtc: new Date(r.e) });

export async function recomputeUser(userId: string, now = new Date()) {
  const horizon = await hostHorizon(userId);
  const from = startOfUtcDay(now);
  const to = addMinutes(from, horizon * 1440);
  const F = from.toISOString(), T = to.toISOString();
  const [rules, overrides, events, bookings] = (await Promise.all([
    sql`select weekday, start_minute, end_minute, timezone from public.availability_rules where user_id = ${userId}::uuid`,
    sql`select kind, start_utc as s, end_utc as e from public.availability_overrides where user_id = ${userId}::uuid and end_utc > ${F}::timestamptz and start_utc < ${T}::timestamptz`,
    sql`select ev.start_utc as s, ev.end_utc as e from public.calendar_events ev join public.connected_calendars c on c.id = ev.calendar_id
        where c.user_id = ${userId}::uuid and ev.is_blocking and ev.end_utc > ${F}::timestamptz and ev.start_utc < ${T}::timestamptz`,
    // Shared-capacity sessions only block the host once every seat is taken.
    sql`select b.block_start_utc as s, b.block_end_utc as e from public.bookings b
        join public.booking_event_types t on t.id = b.event_type_id
        where b.host_user_id = ${userId}::uuid
        and b.status in ('held','pending_payment','requested','confirmed') and b.block_end_utc > ${F}::timestamptz and b.block_start_utc < ${T}::timestamptz
        and (not b.shared_slot or (select count(*) from public.bookings o where o.event_type_id = b.event_type_id and o.start_utc = b.start_utc
          and o.host_user_id = b.host_user_id and o.shared_slot and o.status in ('held','pending_payment','requested','confirmed')) >= t.resource_capacity)`,
  ])) as unknown as [
    { weekday: number; start_minute: number; end_minute: number; timezone: string }[],
    { kind: string; s: string; e: string }[],
    { s: string; e: string }[],
    { s: string; e: string }[],
  ];
  const days = computeDays({
    rules: rules.map((r): AvailabilityRule => ({ weekday: r.weekday, startMinute: r.start_minute, endMinute: r.end_minute, timezone: r.timezone })),
    freeOverrides: overrides.filter((o) => o.kind === "free").map(iv),
    busy: [...overrides.filter((o) => o.kind === "busy").map(iv), ...events.map(iv), ...bookings.map(iv)],
    fromDay: from,
    days: horizon,
  });
  await sql.transaction([
    sql`delete from public.availability_cache where user_id = ${userId}::uuid and (day < ${days[0]!.day}::date or day > ${days[days.length - 1]!.day}::date)`,
    sql`insert into public.availability_cache (user_id, day, free_bits, computed_at)
      select ${userId}::uuid, d.day::date, d.bits::bit(96), now()
      from unnest(${days.map((d) => d.day)}::text[], ${days.map((d) => d.bits)}::text[]) as d(day, bits)
      on conflict (user_id, day) do update set free_bits = excluded.free_bits, version = public.availability_cache.version + 1, computed_at = now()`,
  ]);
  return days.length;
}

/** Drain due jobs. Claims rows by deleting them; failures are re-queued with backoff. */
export async function runDueJobs(limit = 25) {
  const due = (await sql`delete from public.availability_jobs where user_id in (
      select user_id from public.availability_jobs where run_after <= now() order by run_after limit ${limit} for update skip locked)
    returning user_id, attempts`) as { user_id: string; attempts: number }[];
  let done = 0;
  for (const j of due) {
    try {
      await withDbContext({ userId: j.user_id, workspaceId: null }, () => recomputeUser(j.user_id));
      done++;
    } catch (e) {
      console.error("[availability] recompute", e instanceof Error ? e.message : "error");
      if (j.attempts < 5)
        await sql`insert into public.availability_jobs (user_id, reason, run_after, attempts)
          values (${j.user_id}::uuid, 'retry', now() + make_interval(mins => ${2 ** j.attempts}), ${j.attempts + 1})
          on conflict (user_id) do nothing`;
    }
  }
  return { claimed: due.length, done };
}

/** Sync ICS + CalDAV calendars that are due; only BusyBlocks are written. Each runs as its owner. */
export async function syncDueCalendars(limit = 20) {
  const due = (await sql`select id::text as id, user_id::text as user_id from public.rout_booking_due_calendars(${limit})`) as { id: string; user_id: string }[];
  let synced = 0;
  for (const c of due) synced += await withDbContext({ userId: c.user_id, workspaceId: null }, () => syncCalendars([c.id]));
  return { synced, checked: due.length };
}

/** Sync specific calendars right away (owner pressed "sync now"); runs in the caller's RLS context. */
export async function syncCalendarIds(ids: string[]) {
  return { synced: await syncCalendars(ids), checked: ids.length };
}

async function syncCalendars(ids: string[]): Promise<number> {
  const key = process.env["BOOKING_HMAC_KEY"] ?? process.env["CONTACT_HASH_SALT"];
  if (!key) throw new Error("BOOKING_HMAC_KEY missing");
  const { open } = await import("@/lib/crypto/secretbox.server");
  const { fetchIcsFeed, fetchCaldav, CalendarFetchError } = await import("./adapters/fetchers.server");
  const { toBusyBlocks } = await import("./adapters/zero-knowledge");
  const { icsFeedCredentials, caldavCredentials } = await import("./types");
  const cals = (await sql`select id, user_id, adapter, credentials_ciphertext, credentials_iv, sync_cursor
    from public.connected_calendars where adapter in ('ics','caldav') and sync_status <> 'disconnected' and id = any(${ids}::uuid[])`) as
    { id: string; user_id: string; adapter: string; credentials_ciphertext: string; credentials_iv: string; sync_cursor: string | null }[];
  const now = new Date();
  let synced = 0;
  for (const c of cals) {
    const horizon = await hostHorizon(c.user_id);
    const from = addMinutes(startOfUtcDay(now), -1440);
    const to = addMinutes(from, (horizon + 2) * 1440);
    try {
      const creds = JSON.parse(await open(c.credentials_ciphertext, c.credentials_iv, `calendar:${c.id}`));
      let raw;
      let cursor = c.sync_cursor;
      if (c.adapter === "ics") {
        const r = await fetchIcsFeed(icsFeedCredentials.parse(creds).url, from, to, c.sync_cursor);
        if (r.notModified) {
          await sql`update public.connected_calendars set last_synced_at = now(), sync_status = 'ok', last_error_code = null where id = ${c.id}::uuid`;
          continue;
        }
        raw = r.events;
        cursor = r.etag;
      } else raw = (await fetchCaldav(caldavCredentials.parse(creds), from, to)).events;
      const blocks = await toBusyBlocks(raw, key, c.id);
      await sql.transaction([
        sql`delete from public.calendar_events where calendar_id = ${c.id}::uuid`,
        sql`insert into public.calendar_events (calendar_id, provider_id, start_utc, end_utc, is_blocking)
          select ${c.id}::uuid, b.p, b.s::timestamptz, b.e::timestamptz, b.blk
          from unnest(${blocks.map((b) => b.providerId)}::text[], ${blocks.map((b) => b.startUtc.toISOString())}::text[],
                      ${blocks.map((b) => b.endUtc.toISOString())}::text[], ${blocks.map((b) => b.isBlocking)}::boolean[]) as b(p, s, e, blk)
          on conflict (calendar_id, provider_id) do nothing`,
        sql`update public.connected_calendars set last_synced_at = now(), sync_status = 'ok', last_error_code = null, sync_cursor = ${cursor} where id = ${c.id}::uuid`,
        sql`insert into public.availability_jobs (user_id, reason) values (${c.user_id}::uuid, 'calendar_sync')
          on conflict (user_id) do update set run_after = least(public.availability_jobs.run_after, now())`,
      ]);
      synced++;
    } catch (e) {
      const code = e instanceof CalendarFetchError ? e.code : "internal";
      await sql`update public.connected_calendars set last_synced_at = now(), sync_status = 'error', last_error_code = ${code} where id = ${c.id}::uuid`;
    }
  }
  return synced;
}
