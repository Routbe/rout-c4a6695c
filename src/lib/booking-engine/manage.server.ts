/**
 * Owner-side booking management. Every entry point takes the session user id
 * and checks ownership (personal) or workspace role (owner/admin) server-side.
 */
import { sql } from "@/lib/neon";
import { assertWorkspaceRole, resolveActiveWorkspace } from "@/lib/workspaces.server";
import { recomputeUser } from "./recompute.server";
import type { EventTypeInput, AvailabilityRule } from "./types";
import { intakeFields } from "./intake";
import { effectiveMaxDaysAhead } from "./slot-rules";

/** db/0218 columns exist (cached 60 s), so saves never reference missing columns before it is applied. */
let phase2Probe: { ok: boolean; at: number } | null = null;
async function hasPhase2(): Promise<boolean> {
  if (phase2Probe && Date.now() - phase2Probe.at < 60_000) return phase2Probe.ok;
  const rows = (await sql`select to_regclass('public.booking_holds') is not null as ok`) as { ok: boolean }[];
  phase2Probe = { ok: Boolean(rows[0]?.ok), at: Date.now() };
  return phase2Probe.ok;
}

/** Host-only view of intake answers: labels + values; sealed ones are opened server-side. */
async function readIntake(b: Record<string, unknown>): Promise<{ label: string; value: string }[]> {
  const stored = b["intake_answers"] as { plain?: Record<string, unknown>; sealed?: { ciphertext: string; iv: string } } | null;
  if (!stored) return [];
  const fields = intakeFields.safeParse(b["custom_fields"] ?? []).data ?? [];
  let all: Record<string, unknown> = { ...(stored.plain ?? {}) };
  if (stored.sealed) {
    try {
      const { open } = await import("@/lib/crypto/secretbox.server");
      all = { ...all, ...(JSON.parse(await open(stored.sealed.ciphertext, stored.sealed.iv, `intake:${String(b["event_type_id"])}`)) as object) };
    } catch { all["_"] = "🔒"; }
  }
  return Object.entries(all).map(([k, v]) => ({ label: fields.find((f) => f.id === k)?.label ?? k, value: v === true ? "✓" : v === false ? "—" : String(v) }));
}

/** Exceptions next to weekly hours: 'busy' = closed (holiday), 'free' = extra opening. */
export async function addOverride(userId: string, kind: "free" | "busy", startUtc: string, endUtc: string) {
  const n = (await sql`select count(*)::int as n from public.availability_overrides where user_id = ${userId}::uuid and end_utc > now()`) as { n: number }[];
  if (n[0]!.n >= 100) throw new Error("too_many_overrides");
  await sql`insert into public.availability_overrides (user_id, kind, start_utc, end_utc) values (${userId}::uuid, ${kind}, ${startUtc}::timestamptz, ${endUtc}::timestamptz)`;
  await recomputeUser(userId);
}
export async function removeOverride(userId: string, id: string) {
  await sql`delete from public.availability_overrides where id = ${id}::uuid and user_id = ${userId}::uuid`;
  await recomputeUser(userId);
}

const ACTIVE = ["held", "pending_payment", "requested", "confirmed"];

async function assertCanManageEventType(userId: string, eventTypeId: string) {
  const rows = (await sql`select user_id, workspace_id from public.booking_event_types where id = ${eventTypeId}::uuid`) as { user_id: string | null; workspace_id: string | null }[];
  const r = rows[0];
  if (!r) throw new Error("not_found");
  if (r.user_id) { if (r.user_id !== userId) throw new Error("forbidden"); return r; }
  if (!r.workspace_id) throw new Error("forbidden");
  const active = await resolveActiveWorkspace(userId);
  if (active.workspaceId !== r.workspace_id) throw new Error("forbidden");
  await assertWorkspaceRole(userId, r.workspace_id, ["owner", "admin"]);
  return r;
}

export async function overview(userId: string) {
  const { workspaceId, role } = await resolveActiveWorkspace(userId);
  const canWs = Boolean(workspaceId && (role === "owner" || role === "admin"));
  const overrides = (await sql`select id, kind, start_utc, end_utc from public.availability_overrides
    where user_id = ${userId}::uuid and end_utc > now() order by start_utc limit 100`) as Record<string, unknown>[];
  const [types, calendars, bookings, rules, members] = (await Promise.all([
    sql`select t.*, coalesce((select json_agg(json_build_object('userId', h.user_id, 'priority', h.priority) order by h.priority desc)
          from public.booking_event_type_hosts h where h.event_type_id = t.id), '[]'::json) as hosts
        from public.booking_event_types t
        where (${workspaceId}::uuid is null and t.user_id = ${userId}::uuid and t.workspace_id is null)
           or (${canWs} and t.workspace_id = ${workspaceId}::uuid)
        order by t.created_at desc limit 100`,
    sql`select id, adapter, label, sync_status, last_error_code, last_synced_at from public.connected_calendars
        where user_id = ${userId}::uuid order by created_at`,
    sql`select b.id, b.status, b.start_utc, b.end_utc, b.guest_name, b.guest_email, b.guest_timezone, b.guest_note, b.intake_answers, b.event_type_id, t.title, t.custom_fields
        from public.bookings b join public.booking_event_types t on t.id = b.event_type_id
        where (( ${workspaceId}::uuid is null and b.host_user_id = ${userId}::uuid and b.workspace_id is null)
          or (${canWs} and b.workspace_id = ${workspaceId}::uuid))
          and b.end_utc > now() - interval '1 day' and b.status = any(${ACTIVE}::text[])
        order by (b.status = 'requested') desc, b.start_utc limit 100`,
    sql`select weekday, start_minute, end_minute, timezone from public.availability_rules where user_id = ${userId}::uuid order by weekday, start_minute`,
    canWs
      ? sql`select m.user_id::text as user_id, coalesce(p.display_name, u.email) as name
          from public.workspace_members m join public.users u on u.id = m.user_id
          left join public.profiles p on p.id = m.user_id where m.workspace_id = ${workspaceId}::uuid limit 200`
      : Promise.resolve([]),
  ])) as unknown as [Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], { user_id: string; name: string }[]];
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    workspaceId: canWs ? workspaceId : null,
    /** Holds, limits and business-day windows are live (db/0218). */
    phase2: await hasPhase2().catch(() => false),
    members,
    eventTypes: types.map((t) => ({
      id: String(t["id"]), workspaceId: s(t["workspace_id"]), slug: String(t["slug"]), title: String(t["title"]),
      durationMinutes: Number(t["duration_minutes"]), bufferBeforeMinutes: Number(t["buffer_before_minutes"]),
      bufferAfterMinutes: Number(t["buffer_after_minutes"]), minimumNoticeHours: Number(t["minimum_notice_hours"]),
      maxDaysAhead: Number(t["max_days_ahead"]), slotStepMinutes: Number(t["slot_step_minutes"]),
      confirmationMode: String(t["confirmation_mode"]) as "instant" | "request",
      priceCents: t["price_cents"] == null ? null : Number(t["price_cents"]),
      routingStrategy: String(t["routing_strategy"]) as "STRICT" | "ROUND_ROBIN" | "COLLECTIVE",
      locationKind: String(t["location_kind"]) as "video" | "address" | "phone", locationValue: s(t["location_value"]),
      resourceCapacity: Number(t["resource_capacity"] ?? 1),
      limitPerDay: t["limit_per_day"] == null ? null : Number(t["limit_per_day"]),
      limitPerWeek: t["limit_per_week"] == null ? null : Number(t["limit_per_week"]),
      limitPerMonth: t["limit_per_month"] == null ? null : Number(t["limit_per_month"]),
      limitPerGuest: t["limit_per_guest"] == null ? null : Number(t["limit_per_guest"]),
      horizonBusinessDays: t["horizon_business_days"] == null ? null : Number(t["horizon_business_days"]),
      adjacentOnly: Boolean(t["adjacent_only"]),
      rulesTimezone: s(t["rules_timezone"]),
      phase2: "adjacent_only" in t,
      customFields: intakeFields.safeParse(t["custom_fields"] ?? []).data ?? [],
      isActive: Boolean(t["is_active"]), hosts: (t["hosts"] as { userId: string; priority: number }[]) ?? [],
    })),
    calendars: calendars.map((c) => ({
      id: String(c["id"]), adapter: String(c["adapter"]), label: s(c["label"]), syncStatus: String(c["sync_status"]),
      lastErrorCode: s(c["last_error_code"]), lastSyncedAt: c["last_synced_at"] ? new Date(String(c["last_synced_at"])).toISOString() : null,
    })),
    overrides: overrides.map((o) => ({ id: String(o["id"]), kind: String(o["kind"]) as "free" | "busy",
      startUtc: new Date(String(o["start_utc"])).toISOString(), endUtc: new Date(String(o["end_utc"])).toISOString() })),
    bookings: (await Promise.all(bookings.map(async (b) => ({ ...b, intake: await readIntake(b) })))).map((b) => ({
      intake: b.intake,
      id: String(b["id"]), status: String(b["status"]), title: String(b["title"]),
      startUtc: new Date(String(b["start_utc"])).toISOString(), endUtc: new Date(String(b["end_utc"])).toISOString(),
      guestName: String(b["guest_name"]), guestEmail: String(b["guest_email"]), guestTimezone: String(b["guest_timezone"]), guestNote: s(b["guest_note"]),
    })),
    rules: rules.map((r) => ({ weekday: Number(r["weekday"]), startMinute: Number(r["start_minute"]), endMinute: Number(r["end_minute"]), timezone: String(r["timezone"]) })),
  };
}

export async function saveEventType(userId: string, id: string | null, input: EventTypeInput) {
  const active = await resolveActiveWorkspace(userId);
  if (active.workspaceId !== input.workspaceId) throw new Error("forbidden");
  if (input.workspaceId) {
    await assertWorkspaceRole(userId, input.workspaceId, ["owner", "admin"]);
    const ok = (await sql`select count(*)::int as n from public.workspace_members where workspace_id = ${input.workspaceId}::uuid
      and user_id = any(${input.hostUserIds}::uuid[])`) as { n: number }[];
    if (ok[0]!.n !== new Set(input.hostUserIds).size) throw new Error("host_not_member");
  } else {
    if (input.ownerUserId !== userId) throw new Error("forbidden");
    input = { ...input, hostUserIds: [userId], routingStrategy: "STRICT" };
  }
  if (id) await assertCanManageEventType(userId, id);
  const etId = id ?? crypto.randomUUID();
  const v = { ...input, maxDaysAhead: effectiveMaxDaysAhead(input.maxDaysAhead, input.horizonBusinessDays) };
  const phase2 = await hasPhase2();
  const upsert = id
    ? sql`update public.booking_event_types set slug = ${v.slug}, title = ${v.title}, description = ${v.description},
        duration_minutes = ${v.durationMinutes}, buffer_before_minutes = ${v.bufferBeforeMinutes}, buffer_after_minutes = ${v.bufferAfterMinutes},
        minimum_notice_hours = ${v.minimumNoticeHours}, max_days_ahead = ${v.maxDaysAhead}, slot_step_minutes = ${v.slotStepMinutes},
        confirmation_mode = ${v.confirmationMode}, price_cents = ${v.priceCents}, currency = ${v.currency},
        routing_strategy = ${v.routingStrategy}, location_kind = ${v.locationKind}, location_value = ${v.locationValue},
        resource_capacity = ${v.resourceCapacity}, custom_fields = ${JSON.stringify(v.customFields)}::jsonb, updated_at = now()
      where id = ${etId}::uuid`
    : sql`insert into public.booking_event_types (id, user_id, workspace_id, slug, title, description, duration_minutes,
        buffer_before_minutes, buffer_after_minutes, minimum_notice_hours, max_days_ahead, slot_step_minutes, confirmation_mode,
        price_cents, currency, routing_strategy, location_kind, location_value, resource_capacity, custom_fields)
      values (${etId}::uuid, ${v.ownerUserId}, ${v.workspaceId}, ${v.slug}, ${v.title}, ${v.description}, ${v.durationMinutes},
        ${v.bufferBeforeMinutes}, ${v.bufferAfterMinutes}, ${v.minimumNoticeHours}, ${v.maxDaysAhead}, ${v.slotStepMinutes}, ${v.confirmationMode},
        ${v.priceCents}, ${v.currency}, ${v.routingStrategy}, ${v.locationKind}, ${v.locationValue}, ${v.resourceCapacity}, ${JSON.stringify(v.customFields)}::jsonb)`;
  const priorities = v.hostUserIds.map((_, i) => v.hostUserIds.length - i);
  try {
    await sql.transaction([
      upsert,
      ...(phase2
        ? [sql`update public.booking_event_types set limit_per_day = ${v.limitPerDay}, limit_per_week = ${v.limitPerWeek},
            limit_per_month = ${v.limitPerMonth}, limit_per_guest = ${v.limitPerGuest}, horizon_business_days = ${v.horizonBusinessDays},
            adjacent_only = ${v.adjacentOnly}, rules_timezone = ${v.rulesTimezone} where id = ${etId}::uuid`]
        : []),
      sql`delete from public.booking_event_type_hosts where event_type_id = ${etId}::uuid`,
      sql`insert into public.booking_event_type_hosts (event_type_id, user_id, priority)
        select ${etId}::uuid, h.u, h.p from unnest(${v.hostUserIds}::uuid[], ${priorities}::int[]) as h(u, p)`,
    ]);
  } catch (e) {
    if (/23505|duplicate key/.test(e instanceof Error ? e.message : "")) throw new Error("slug_taken");
    throw e;
  }
  return { id: etId };
}

export async function setEventTypeActive(userId: string, id: string, active: boolean) {
  await assertCanManageEventType(userId, id);
  await sql`update public.booking_event_types set is_active = ${active}, updated_at = now() where id = ${id}::uuid`;
}

export async function saveRules(userId: string, rules: AvailabilityRule[]) {
  await sql.transaction([
    sql`delete from public.availability_rules where user_id = ${userId}::uuid`,
    sql`insert into public.availability_rules (user_id, weekday, start_minute, end_minute, timezone)
      select ${userId}::uuid, r.w, r.s, r.e, r.tz from unnest(${rules.map((r) => r.weekday)}::int[], ${rules.map((r) => r.startMinute)}::int[],
        ${rules.map((r) => r.endMinute)}::int[], ${rules.map((r) => r.timezone)}::text[]) as r(w, s, e, tz)`,
  ]);
  await recomputeUser(userId);
}

export async function addCalendar(userId: string, adapter: "ics" | "caldav", label: string | null, credentials: object) {
  const { seal, encryptionConfigured } = await import("@/lib/crypto/secretbox.server");
  if (!encryptionConfigured()) throw new Error("encryption_unavailable");
  const id = crypto.randomUUID();
  const { ciphertext, iv } = await seal(JSON.stringify(credentials), `calendar:${id}`);
  const n = (await sql`select count(*)::int as n from public.connected_calendars where user_id = ${userId}::uuid`) as { n: number }[];
  if (n[0]!.n >= 10) throw new Error("too_many_calendars");
  await sql`insert into public.connected_calendars (id, user_id, adapter, label, credentials_ciphertext, credentials_iv)
    values (${id}::uuid, ${userId}::uuid, ${adapter}, ${label}, ${ciphertext}, ${iv})`;
  return { id };
}

export async function removeCalendar(userId: string, id: string) {
  await sql`delete from public.connected_calendars where id = ${id}::uuid and user_id = ${userId}::uuid`;
  await recomputeUser(userId);
}

export async function syncNow(userId: string, id: string) {
  const owned = (await sql`update public.connected_calendars set last_synced_at = null where id = ${id}::uuid and user_id = ${userId}::uuid returning id`) as unknown[];
  // Only the owner's own calendar is ever synced.
  if (!owned.length) return;
  const { syncCalendarIds } = await import("./recompute.server");
  await syncCalendarIds([id]);
  await recomputeUser(userId);
}

/**
 * Owner actions on a booking. Only a host of the booking can act; transitions
 * are guarded in SQL. Collective bookings move as one group: every host's row
 * changes together, never just the actor's. Workspace bookings additionally
 * require that the actor is still a member of that workspace at that moment.
 */
export async function bookingAction(userId: string, id: string, action: "confirm" | "decline" | "cancel") {
  const from = action === "cancel" ? ["confirmed", "requested"] : ["requested"];
  const to = action === "confirm" ? "confirmed" : action === "decline" ? "declined" : "cancelled";
  const rows = (await sql`with target as (
        select b.id, b.group_id from public.bookings b
        where b.id = ${id}::uuid and b.host_user_id = ${userId}::uuid and b.status = any(${from}::text[])
          and (b.workspace_id is null or exists (select 1 from public.workspace_members m where m.workspace_id = b.workspace_id and m.user_id = ${userId}::uuid))
      )
      update public.bookings b set status = ${to}, sequence = b.sequence + ${action === "cancel" ? 1 : 0}, updated_at = now()
      from target
      where (b.id = target.id or (target.group_id is not null and b.group_id = target.group_id)) and b.status = any(${from}::text[])
      returning b.id, b.host_user_id`) as { id: string; host_user_id: string }[];
  if (!rows.some((r) => r.id === id)) return { ok: false as const };
  const { sendBookingInvite } = await import("./invite.server");
  if (action === "confirm") void sendBookingInvite(id, "REQUEST");
  if (action === "cancel") void sendBookingInvite(id, "CANCEL");
  for (const host of new Set(rows.map((r) => r.host_user_id))) {
    if (host === userId) await recomputeUser(userId);
    else await sql`insert into public.availability_jobs (user_id, reason) values (${host}::uuid, 'booking_action')
      on conflict (user_id) do update set run_after = least(public.availability_jobs.run_after, now())`;
  }
  return { ok: true as const };
}
