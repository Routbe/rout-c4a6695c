// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * db/0218: 5-minute soft-locks, per-period and per-guest limits, business-day
 * horizon and gap-free starts — all enforced inside the definer functions.
 */
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SOLO = "11111111-1111-4111-8111-111111111111";
const TEAM = "22222222-2222-4222-8222-222222222222";
const SEATS = "33333333-3333-4333-8333-333333333333";
const ADJ = "66666666-6666-4666-8666-666666666666";
const CLIENT = "a".repeat(64);
const OTHER = "b".repeat(64);

const dayAt = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const day = dayAt(3);
const next = dayAt(4);
const at = (hhmm: string, d = day) => `${d}T${hhmm}:00Z`;
type J = Record<string, unknown>;

async function hold(type: string, start: string, client = CLIENT, replace: [string, string] | null = null): Promise<J> {
  const r = await db.query<{ r: J }>("select public.rout_booking_hold($1::uuid, $2::timestamptz, $3, $4::uuid, $5) as r",
    [type, start, client, replace?.[0] ?? null, replace?.[1] ?? null]);
  return r.rows[0]!.r;
}
async function create(type: string, start: string, opts: { email?: string; hold?: J } = {}): Promise<J> {
  const r = await db.query<{ r: J }>(
    "select public.rout_booking_create($1::uuid, $2::timestamptz, 'Ann', $3, 'Europe/Brussels', null, null, $4::uuid, $5) as r",
    [type, start, opts.email ?? "ann@example.com", (opts.hold?.["holdId"] as string) ?? null, (opts.hold?.["secret"] as string) ?? null]);
  return r.rows[0]!.r;
}
async function legacyCreate(type: string, start: string): Promise<J> {
  const r = await db.query<{ r: J }>(
    "select public.rout_booking_create($1::uuid, $2::timestamptz, 'Ann', 'ann@example.com', 'Europe/Brussels', null, null) as r", [type, start]);
  return r.rows[0]!.r;
}
async function setType(id: string, set: string) {
  await db.exec(`update public.booking_event_types set ${set} where id = '${id}'`);
}

beforeAll(async () => {
  await db.exec(`
    create extension btree_gist; create extension pgcrypto;
    create role rout_app;
    create table public.users(id uuid primary key);
    insert into public.users values ('${A}'), ('${B}');
    create table public.workspaces(id uuid primary key, name text);
    insert into public.workspaces values ('${WS}', 'Team');
    create table public.workspace_members(workspace_id uuid, user_id uuid, role text);
    create table public.profiles(id uuid primary key, username text, display_name text, display_prefs jsonb, is_banned boolean, is_suspended boolean);
    insert into public.profiles values ('${A}', 'ann', 'Ann Host', '{}', false, false), ('${B}', 'bob', 'Bob Host', '{}', false, false);
    create function public.rout_current_user_id() returns uuid language sql stable as $$ select nullif(current_setting('rout.current_user_id', true), '')::uuid $$;
  `);
  for (const f of ["104_booking_engine", "110_booking_custom_fields", "0144_booking_tokens", "0216_booking_public_boundary",
    "0217_booking_internal_revoke", "0218_booking_holds_and_limits", "0219_booking_public_sessions"]) {
    await db.exec(readFileSync(`db/${f}.sql`, "utf8"));
  }
  // Applying 0218 and 0219 twice must be harmless.
  await db.exec(readFileSync("db/0218_booking_holds_and_limits.sql", "utf8"));
  await db.exec(readFileSync("db/0219_booking_public_sessions.sql", "utf8"));
  // Live state before 0220: RLS on, owner scope on connected_calendars, the open 0154 policy on calendar_events.
  await db.exec(`
    alter table public.connected_calendars enable row level security;
    alter table public.calendar_events enable row level security;
    create policy rout_scope on public.connected_calendars using (user_id = public.rout_current_user_id()) with check (user_id = public.rout_current_user_id());
    create policy rout_server on public.calendar_events to rout_app using (true) with check (true);
  `);
  await db.exec(readFileSync("db/0220_calendar_events_owner_scope.sql", "utf8"));
  await db.exec(readFileSync("db/0220_calendar_events_owner_scope.sql", "utf8"));
  await db.exec(`
    insert into public.booking_event_types (id, user_id, slug, title, duration_minutes, buffer_after_minutes, minimum_notice_hours, max_days_ahead)
      values ('${SOLO}', '${A}', 'intro', 'Intro', 30, 15, 0, 30);
    insert into public.booking_event_types (id, workspace_id, slug, title, duration_minutes, routing_strategy, minimum_notice_hours)
      values ('${TEAM}', '${WS}', 'team', 'Team', 30, 'ROUND_ROBIN', 0);
    insert into public.booking_event_types (id, user_id, slug, title, duration_minutes, resource_capacity, minimum_notice_hours)
      values ('${SEATS}', '${A}', 'class', 'Class', 60, 2, 0);
    insert into public.booking_event_types (id, user_id, slug, title, duration_minutes, minimum_notice_hours, adjacent_only)
      values ('${ADJ}', '${B}', 'tight', 'Tight', 30, 0, true);
    insert into public.booking_event_type_hosts values ('${SOLO}', '${A}', 0), ('${SEATS}', '${A}', 0), ('${ADJ}', '${B}', 0),
      ('${TEAM}', '${A}', 0), ('${TEAM}', '${B}', 0);
  `);
}, 60000);
afterAll(() => db.close());

beforeEach(async () => {
  await db.exec("delete from public.booking_holds; delete from public.bookings; delete from public.availability_cache; delete from public.availability_jobs;");
  await db.exec(`update public.booking_event_types set limit_per_day = null, limit_per_week = null, limit_per_month = null,
    limit_per_guest = null, horizon_business_days = null, rules_timezone = null`);
  // Free 08:00–18:00 UTC on both test days for both hosts (bits 32..71).
  const bits = "0".repeat(32) + "1".repeat(40) + "0".repeat(24);
  for (const d of [day, next]) {
    await db.query("insert into public.availability_cache (user_id, day, free_bits) values ($1, $3::date, $4::bit(96)), ($2, $3::date, $4::bit(96))", [A, B, d, bits]);
  }
});

describe("soft-lock: a clicked slot is reserved for 5 minutes", () => {
  it("lasts exactly 5 minutes and returns a 256-bit secret", async () => {
    const h = await hold(SOLO, at("10:00"));
    expect(h["ok"]).toBe(true);
    expect(String(h["secret"])).toMatch(/^[a-f0-9]{64}$/);
    const r = await db.query<{ s: number }>("select extract(epoch from (expires_at - created_at))::int as s from public.booking_holds");
    expect(r.rows[0]!.s).toBe(300);
    const stored = await db.query<{ d: string }>("select encode(secret_digest, 'hex') as d from public.booking_holds");
    expect(stored.rows[0]!.d).not.toBe(h["secret"]);
  });

  it("nobody else can hold or book the held block, the holder can", async () => {
    const h = await hold(SOLO, at("10:00"));
    expect((await hold(SOLO, at("10:00"), OTHER))["reason"]).toBe("slot_taken");
    // 10:15 overlaps the held block 10:00–10:45 (30 min + 15 min buffer).
    expect((await hold(SOLO, at("10:15"), OTHER))["reason"]).toBe("slot_taken");
    expect((await create(SOLO, at("10:00"), { email: "eve@example.com" }))["reason"]).toBe("slot_taken");
    expect((await legacyCreate(SOLO, at("10:00")))["reason"]).toBe("slot_taken");
    const mine = await create(SOLO, at("10:00"), { hold: h });
    expect(mine["ok"]).toBe(true);
    const left = await db.query("select 1 from public.booking_holds");
    expect(left.rows).toHaveLength(0);
  });

  it("a wrong secret is no hold at all", async () => {
    const h = await hold(SOLO, at("10:00"));
    expect((await create(SOLO, at("10:00"), { hold: { holdId: h["holdId"], secret: "c".repeat(64) } }))["reason"]).toBe("slot_taken");
  });

  it("an expired hold frees the slot for others", async () => {
    await hold(SOLO, at("10:00"));
    await db.exec("update public.booking_holds set created_at = now() - interval '6 minutes', expires_at = now() - interval '1 second'");
    expect((await hold(SOLO, at("10:00"), OTHER))["ok"]).toBe(true);
    const n = await db.query<{ n: number }>("select count(distinct hold_id)::int as n from public.booking_holds");
    expect(n.rows[0]!.n).toBe(1);
  });

  it("an expired own hold still books when the slot is still free", async () => {
    const h = await hold(SOLO, at("10:00"));
    await db.exec("update public.booking_holds set created_at = now() - interval '6 minutes', expires_at = now() - interval '1 second'");
    expect((await create(SOLO, at("10:00"), { hold: h }))["ok"]).toBe(true);
  });

  it("switching slots releases the previous hold, release frees it", async () => {
    const first = await hold(SOLO, at("10:00"));
    const second = await hold(SOLO, at("12:00"), CLIENT, [first["holdId"] as string, first["secret"] as string]);
    expect(second["ok"]).toBe(true);
    expect((await hold(SOLO, at("10:00"), OTHER))["ok"]).toBe(true);
    const freed = await db.query<{ ok: boolean }>("select public.rout_booking_hold_release($1::uuid, $2) as ok", [second["holdId"], second["secret"]]);
    expect(freed.rows[0]!.ok).toBe(true);
    expect((await hold(SOLO, at("12:00"), OTHER))["ok"]).toBe(true);
  });

  it("one visitor holds at most 3 slots at the same time", async () => {
    for (const t of ["09:00", "11:00", "13:00"]) expect((await hold(SOLO, at(t)))["ok"]).toBe(true);
    expect((await hold(SOLO, at("15:00")))["reason"]).toBe("too_many_holds");
    expect((await hold(SOLO, at("15:00"), OTHER))["ok"]).toBe(true);
  });

  it("holds count as seats: capacity 2 = one booking + one hold", async () => {
    expect((await create(SEATS, at("12:00")))["ok"]).toBe(true);
    const h = await hold(SEATS, at("12:00"));
    expect(h["ok"]).toBe(true);
    expect((await hold(SEATS, at("12:00"), OTHER))["reason"]).toBe("slot_taken");
    expect((await create(SEATS, at("12:00"), { email: "eve@example.com" }))["reason"]).toBe("slot_taken");
    expect((await create(SEATS, at("12:00"), { hold: h }))["ok"]).toBe(true);
  });

  it("round robin holds pick different hosts and the booking keeps the held host", async () => {
    const one = await hold(TEAM, at("09:00"));
    const two = await hold(TEAM, at("09:00"), OTHER);
    expect(one["ok"]).toBe(true);
    expect(two["ok"]).toBe(true);
    const hosts = await db.query<{ hold_id: string; host_user_id: string }>("select hold_id::text, host_user_id::text from public.booking_holds");
    expect(new Set(hosts.rows.map((r) => r.host_user_id)).size).toBe(2);
    const booked = await create(TEAM, at("09:00"), { hold: two });
    const heldHost = hosts.rows.find((r) => r.hold_id === two["holdId"])!.host_user_id;
    expect((booked["hostIds"] as string[])[0]).toBe(heldHost);
  });

  it("the database refuses two overlapping private holds even without the functions", async () => {
    await hold(SOLO, at("10:00"));
    await expect(db.query(`insert into public.booking_holds (hold_id, host_user_id, event_type_id, start_utc, block_start_utc, block_end_utc,
      secret_digest, client_digest, expires_at) values (gen_random_uuid(), $1, $2, $3, $3, $3::timestamptz + interval '30 minutes',
      sha256('x'), sha256('y'), now() + interval '5 minutes')`, [A, SOLO, at("10:15")])).rejects.toThrow(/booking_holds_no_overlap|exclusion/);
  });
});

describe("limits per day, week, month and per guest", () => {
  it("1 per day: a second meeting that day is refused, the next day is fine", async () => {
    await setType(SOLO, "limit_per_day = 1");
    expect((await create(SOLO, at("10:00")))["ok"]).toBe(true);
    expect((await create(SOLO, at("14:00")))["reason"]).toBe("slot_taken");
    expect((await hold(SOLO, at("14:00"), OTHER))["reason"]).toBe("slot_taken");
    expect((await create(SOLO, at("14:00", next)))["ok"]).toBe(true);
  });

  it("a live hold uses up the day limit for others", async () => {
    await setType(SOLO, "limit_per_day = 1");
    const h = await hold(SOLO, at("10:00"));
    expect((await create(SOLO, at("14:00"), { email: "eve@example.com" }))["reason"]).toBe("slot_taken");
    expect((await create(SOLO, at("10:00"), { hold: h }))["ok"]).toBe(true);
  });

  it("days are counted in the type's own zone (Tokyo: 14:00 and 15:00 UTC are different days)", async () => {
    await setType(SOLO, "limit_per_day = 1, rules_timezone = 'Asia/Tokyo'");
    expect((await create(SOLO, at("14:00")))["ok"]).toBe(true); // 23:00 Tokyo
    expect((await create(SOLO, at("15:00")))["ok"]).toBe(true); // 00:00 next day Tokyo
    expect((await create(SOLO, at("16:00")))["reason"]).toBe("slot_taken");
  });

  it("week and month limits", async () => {
    await setType(SOLO, "limit_per_week = 2");
    const sameWeek = (await db.query<{ same: boolean }>(
      "select date_trunc('week', $1::timestamp) = date_trunc('week', $2::timestamp) as same", [day, next])).rows[0]!.same;
    expect((await create(SOLO, at("09:00")))["ok"]).toBe(true);
    expect((await create(SOLO, at("11:00")))["ok"]).toBe(true);
    expect((await create(SOLO, at("09:00", next)))["ok"]).toBe(!sameWeek);
    await db.exec("delete from public.bookings");
    await setType(SOLO, "limit_per_week = null, limit_per_month = 1");
    expect((await create(SOLO, at("09:00")))["ok"]).toBe(true);
    expect((await create(SOLO, at("13:00")))["reason"]).toBe("slot_taken");
  });

  it("joining an existing shared start never counts as a new meeting", async () => {
    await setType(SEATS, "limit_per_day = 1");
    expect((await create(SEATS, at("12:00")))["ok"]).toBe(true);
    expect((await create(SEATS, at("12:00"), { email: "eve@example.com" }))["ok"]).toBe(true);
    expect((await create(SEATS, at("15:00"), { email: "zed@example.com" }))["reason"]).toBe("slot_taken");
  });

  it("per guest: one active future booking per e-mail (case-insensitive)", async () => {
    await setType(SOLO, "limit_per_guest = 1");
    expect((await create(SOLO, at("09:00")))["ok"]).toBe(true);
    expect((await create(SOLO, at("13:00"), { email: "ANN@example.com" }))["reason"]).toBe("guest_limit");
    expect((await create(SOLO, at("13:00"), { email: "eve@example.com" }))["ok"]).toBe(true);
  });
});

describe("rolling window in business days", () => {
  const end = async (n: number | null, now: string, max = 365) =>
    new Date((await db.query<{ e: string }>("select public.rout_booking_horizon_end($1, $2, 'Europe/Brussels', $3::timestamptz) as e", [n, max, now])).rows[0]!.e).toISOString();

  it("counts Mon–Fri only and ends at local midnight", async () => {
    // Friday 13 Nov 2026, 10:00 Brussels (UTC+1).
    expect(await end(1, "2026-11-13T09:00:00Z")).toBe("2026-11-13T23:00:00.000Z");
    expect(await end(3, "2026-11-13T09:00:00Z")).toBe("2026-11-17T23:00:00.000Z");
    // Saturday: the first business day is Monday.
    expect(await end(1, "2026-11-14T09:00:00Z")).toBe("2026-11-16T23:00:00.000Z");
    // 10 business days from a Monday = two full weeks.
    expect(await end(10, "2026-11-16T09:00:00Z")).toBe("2026-11-27T23:00:00.000Z");
  });

  it("follows the DST change (midnight after Fri 23 Oct 2026 vs Mon 26 Oct)", async () => {
    expect(await end(1, "2026-10-23T08:00:00Z")).toBe("2026-10-23T22:00:00.000Z"); // CEST
    expect(await end(2, "2026-10-23T08:00:00Z")).toBe("2026-10-26T23:00:00.000Z"); // CET
  });

  it("never exceeds max days ahead and without business days equals it", async () => {
    expect(await end(260, "2026-11-13T09:00:00Z", 30)).toBe("2026-12-13T09:00:00.000Z");
    expect(await end(null, "2026-11-13T09:00:00Z", 30)).toBe("2026-12-13T09:00:00.000Z");
  });

  it("booking beyond the business-day window is too far", async () => {
    await setType(SOLO, "horizon_business_days = 1, rules_timezone = 'Europe/Brussels'");
    expect((await create(SOLO, at("10:00")))["reason"]).toBe("too_far");
    expect((await hold(SOLO, at("10:00")))["reason"]).toBe("too_far");
  });
});

describe("adjacent only: no gaps in the host's day", () => {
  it("an empty day offers only the edges of working hours", async () => {
    expect((await create(ADJ, at("10:00")))["reason"]).toBe("slot_taken");
    expect((await create(ADJ, at("08:00")))["ok"]).toBe(true);
    expect((await create(ADJ, at("17:30")))["ok"]).toBe(true);
  });

  it("after a booking the start right behind it is allowed, a gap is not", async () => {
    expect((await create(ADJ, at("08:00")))["ok"]).toBe(true);
    expect((await create(ADJ, at("08:45")))["reason"]).toBe("slot_taken");
    expect((await create(ADJ, at("08:30")))["ok"]).toBe(true);
  });
});

describe("public view and privileges", () => {
  it("the slot list learns other holds as ranges, never the holder", async () => {
    const h = await hold(SOLO, at("10:00"));
    const others = await db.query<J>("select * from public.rout_booking_public_constraints($1::uuid, now(), now() + interval '30 days', null)", [SOLO]);
    expect(others.rows).toHaveLength(1);
    expect(others.rows[0]!["kind"]).toBe("busy");
    expect(others.rows[0]!["host_ordinal"]).toBe(1);
    expect(JSON.stringify(others.rows)).not.toContain(String(h["secret"]));
    const mine = await db.query("select * from public.rout_booking_public_constraints($1::uuid, now(), now() + interval '30 days', $2::uuid)", [SOLO, h["holdId"]]);
    expect(mine.rows).toHaveLength(0);
  });

  it("a reached limit is published as the full period", async () => {
    await setType(SOLO, "limit_per_day = 1, rules_timezone = 'UTC'");
    await create(SOLO, at("10:00"));
    const r = await db.query<{ kind: string; start_utc: string; end_utc: string }>(
      "select kind, start_utc, end_utc from public.rout_booking_public_constraints($1::uuid, now(), now() + interval '30 days', null) where kind = 'limit'", [SOLO]);
    expect(r.rows).toHaveLength(1);
    expect(new Date(r.rows[0]!.start_utc).toISOString()).toBe(`${day}T00:00:00.000Z`);
    expect(new Date(r.rows[0]!.end_utc).toISOString()).toBe(`${next}T00:00:00.000Z`);
  });

  it("the public type shows the rules and the live horizon", async () => {
    await setType(SOLO, "horizon_business_days = 5, adjacent_only = false");
    const r = await db.query<{ r: J }>("select public.rout_booking_public_event_type($1::uuid) as r", [SOLO]);
    expect(r.rows[0]!.r["holdMinutes"]).toBe(5);
    expect(r.rows[0]!.r["horizonBusinessDays"]).toBe(5);
    expect(r.rows[0]!.r["horizonEndUtc"]).toBeTruthy();
  });

  it("rout_app calls the entry points but not the building blocks, and sees no holds without a session", async () => {
    await hold(SOLO, at("10:00"));
    await db.exec("begin; set local role rout_app;");
    try {
      await expect(db.query("select public.rout_booking_pick_hosts($1::uuid, now(), null)", [SOLO])).rejects.toThrow(/permission denied/);
    } finally { await db.exec("rollback"); }
    await db.exec("begin; set local role rout_app;");
    try {
      expect((await db.query("select * from public.booking_holds")).rows).toHaveLength(0);
      const r = await db.query<{ r: J }>("select public.rout_booking_hold($1::uuid, $2::timestamptz, $3, null, null) as r", [SOLO, at("14:00"), OTHER]);
      expect(r.rows[0]!.r["ok"]).toBe(true);
    } finally { await db.exec("rollback"); }
  });

  it("cron removes expired holds", async () => {
    await hold(SOLO, at("10:00"));
    await db.exec("update public.booking_holds set created_at = now() - interval '10 minutes', expires_at = now() - interval '2 minutes'");
    const n = await db.query<{ n: number }>("select public.rout_booking_release_expired(100) as n");
    expect(n.rows[0]!.n).toBe(1);
  });
});

describe("db/0219: group sessions in the slot list follow the booking rules", () => {
  type S = { host_ordinal: number; start_utc: string; block_start_utc: string; block_end_utc: string; open: boolean };
  const sessions = async (type: string, holdId: unknown = null) =>
    (await db.query<S>("select * from public.rout_booking_public_sessions($1::uuid, now(), now() + interval '30 days', $2::uuid)", [type, holdId])).rows;

  it("a partly filled session keeps its own start open and publishes its block", async () => {
    expect((await create(SEATS, at("12:00")))["ok"]).toBe(true);
    const r = await sessions(SEATS);
    expect(r).toHaveLength(1);
    expect(r[0]!.open).toBe(true);
    expect(new Date(r[0]!.start_utc).toISOString()).toBe(new Date(at("12:00")).toISOString());
    expect(new Date(r[0]!.block_end_utc).toISOString()).toBe(new Date(at("13:00")).toISOString());
    // The booking functions agree: the same start is joinable, an overlapping other start is not.
    expect((await hold(SEATS, at("12:30"), OTHER))["reason"]).toBe("slot_taken");
    expect((await hold(SEATS, at("12:00"), OTHER))["ok"]).toBe(true);
  });

  it("one booking + another visitor's hold fills capacity 2: the start closes", async () => {
    await create(SEATS, at("12:00"));
    await hold(SEATS, at("12:00"), OTHER);
    const r = await sessions(SEATS);
    expect(r).toHaveLength(1);
    expect(r[0]!.open).toBe(false);
    expect((await hold(SEATS, at("12:00")))["reason"]).toBe("slot_taken");
  });

  it("two holds of other visitors also fill it, the holder still sees their own seat", async () => {
    const mine = await hold(SEATS, at("12:00"));
    await hold(SEATS, at("12:00"), OTHER);
    expect((await sessions(SEATS))[0]!.open).toBe(false);
    expect((await sessions(SEATS, mine["holdId"]))[0]!.open).toBe(true);
  });

  it("a partly filled group session blocks the host for every other event type", async () => {
    await create(SEATS, at("12:00"));
    const r = await sessions(SOLO);
    expect(r).toHaveLength(1);
    expect(r[0]!.open).toBe(false);
    expect((await hold(SOLO, at("12:15")))["reason"]).toBe("slot_taken");
  });

  it("a cancelled booking or an expired hold no longer counts", async () => {
    await create(SEATS, at("12:00"));
    await db.exec("update public.bookings set status = 'cancelled'");
    await hold(SEATS, at("14:00"), OTHER);
    await db.exec("update public.booking_holds set created_at = now() - interval '6 minutes', expires_at = now() - interval '1 second'");
    expect(await sessions(SEATS)).toHaveLength(0);
  });

  it("returns only times, nothing for a hidden type, and rout_app may call it", async () => {
    await create(SEATS, at("12:00"));
    const r = await sessions(SEATS);
    expect(Object.keys(r[0]!).sort()).toEqual(["block_end_utc", "block_start_utc", "host_ordinal", "open", "start_utc"]);
    await db.exec(`update public.booking_event_types set is_active = false where id = '${SEATS}'`);
    try {
      expect(await sessions(SEATS)).toHaveLength(0);
    } finally {
      await db.exec(`update public.booking_event_types set is_active = true where id = '${SEATS}'`);
    }
    await db.exec("begin; set local role rout_app;");
    try {
      const n = await db.query("select * from public.rout_booking_public_sessions($1::uuid, now(), now() + interval '30 days', null)", [SEATS]);
      expect(n.rows).toHaveLength(1);
    } finally { await db.exec("rollback"); }
  });
});

describe("db/0220: external calendar busy times belong to their owner only", () => {
  const CAL_A = "44444444-4444-4444-8444-444444444444";
  const CAL_B = "55555555-5555-4555-8555-555555555555";
  const hash = (c: string) => c.repeat(64);
  beforeEach(async () => {
    await db.exec(`delete from public.calendar_events; delete from public.connected_calendars;
      insert into public.connected_calendars (id, user_id, adapter, credentials_ciphertext, credentials_iv)
        values ('${CAL_A}', '${A}', 'ics', 'x', 'y'), ('${CAL_B}', '${B}', 'ics', 'x', 'y');
      insert into public.calendar_events (calendar_id, provider_id, start_utc, end_utc)
        values ('${CAL_A}', '${hash("a")}', '${at("10:00")}', '${at("11:00")}'), ('${CAL_B}', '${hash("b")}', '${at("10:00")}', '${at("11:00")}');`);
  });
  async function asUser<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
    await db.exec(`begin; set local role rout_app; select set_config('rout.current_user_id', '${user ?? ""}', true);`);
    try { return await fn(); } finally { await db.exec("rollback"); }
  }

  it("a member sees and replaces only their own calendar's busy times", async () => {
    const seen = await asUser(A, async () => (await db.query<{ calendar_id: string }>("select calendar_id from public.calendar_events")).rows);
    expect(seen.map((r) => r.calendar_id)).toEqual([CAL_A]);
    const removed = await asUser(A, async () => (await db.query("delete from public.calendar_events returning id")).rows.length);
    expect(removed).toBe(1);
    await expect(asUser(A, () => db.query("insert into public.calendar_events (calendar_id, provider_id, start_utc, end_utc) values ($1, $2, $3, $4)",
      [CAL_B, hash("c"), at("12:00"), at("13:00")]))).rejects.toThrow(/row-level security/);
  });

  it("without a session nothing is visible", async () => {
    expect(await asUser(null, async () => (await db.query("select 1 from public.calendar_events")).rows.length)).toBe(0);
  });

  it("the booking check, called by a guest without session, still sees every host's busy times", async () => {
    expect((await asUser(null, () => hold(SOLO, at("10:15"), OTHER)))["reason"]).toBe("slot_taken");
    expect((await asUser(null, () => hold(SOLO, at("12:00"), OTHER)))["ok"]).toBe(true);
  });
});
