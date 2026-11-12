// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * db/0216: anonymous guests, Stripe and cron reach bookings only through
 * SECURITY DEFINER functions, while rout_app's RLS keeps hiding the rows.
 */
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SOLO = "11111111-1111-4111-8111-111111111111";
const TEAM = "22222222-2222-4222-8222-222222222222";
const SEATS = "33333333-3333-4333-8333-333333333333";
const COLL = "44444444-4444-4444-8444-444444444444";
const PAID = "55555555-5555-4555-8555-555555555555";

// A slot ~3 days ahead at 10:00 UTC on a 15-min grid; all hosts free all day.
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const at = (hhmm: string) => `${day}T${hhmm}:00Z`;

async function create(type: string, start: string, guest = "Ann") {
  const r = await db.query<{ r: Record<string, unknown> }>(
    "select public.rout_booking_create($1::uuid, $2::timestamptz, $3, 'ann@example.com', 'Europe/Brussels', null, null) as r",
    [type, start, guest],
  );
  return r.rows[0]!.r;
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
    create function public.rout_is_workspace_member(ws uuid) returns boolean language sql stable security definer as $$
      select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = public.rout_current_user_id()) $$;
  `);
  await db.exec(readFileSync("db/104_booking_engine.sql", "utf8"));
  await db.exec(readFileSync("db/110_booking_custom_fields.sql", "utf8"));
  await db.exec(readFileSync("db/0144_booking_tokens.sql", "utf8"));
  // Live policies (db/0120 generator) for the tables the boundary protects.
  await db.exec(`
    alter table public.booking_event_types enable row level security;
    create policy rout_scope on public.booking_event_types using (user_id = public.rout_current_user_id() or (workspace_id is not null and public.rout_is_workspace_member(workspace_id)));
    alter table public.bookings enable row level security;
    create policy rout_scope on public.bookings using (host_user_id = public.rout_current_user_id() or (workspace_id is not null and public.rout_is_workspace_member(workspace_id)));
    alter table public.availability_cache enable row level security;
    create policy rout_scope on public.availability_cache using (user_id = public.rout_current_user_id());
  `);
  await db.exec(readFileSync("db/0216_booking_public_boundary.sql", "utf8"));
  await db.exec(`
    insert into public.booking_event_types (id, user_id, slug, title, duration_minutes, buffer_after_minutes, minimum_notice_hours, max_days_ahead)
      values ('${SOLO}', '${A}', 'intro', 'Intro', 30, 15, 2, 30);
    insert into public.booking_event_types (id, workspace_id, slug, title, duration_minutes, routing_strategy, minimum_notice_hours)
      values ('${TEAM}', '${WS}', 'team', 'Team', 30, 'ROUND_ROBIN', 0),
             ('${COLL}', '${WS}', 'panel', 'Panel', 60, 'COLLECTIVE', 0);
    insert into public.booking_event_types (id, user_id, slug, title, duration_minutes, resource_capacity, minimum_notice_hours)
      values ('${SEATS}', '${A}', 'class', 'Class', 60, 2, 0);
    insert into public.booking_event_types (id, user_id, slug, title, duration_minutes, price_cents, minimum_notice_hours)
      values ('${PAID}', '${B}', 'paid', 'Paid', 30, 5000, 0);
    insert into public.booking_event_type_hosts values ('${SOLO}', '${A}', 0), ('${SEATS}', '${A}', 0), ('${PAID}', '${B}', 0),
      ('${TEAM}', '${A}', 0), ('${TEAM}', '${B}', 0), ('${COLL}', '${A}', 0), ('${COLL}', '${B}', 0);
  `);
}, 60000);
afterAll(() => db.close());

beforeEach(async () => {
  await db.exec("delete from public.bookings; delete from public.availability_cache; delete from public.availability_jobs;");
  // Free 08:00–18:00 UTC on the test day for both hosts (bits 32..71).
  const bits = "0".repeat(32) + "1".repeat(40) + "0".repeat(24);
  await db.query("insert into public.availability_cache (user_id, day, free_bits) values ($1, $3::date, $4::bit(96)), ($2, $3::date, $4::bit(96))", [A, B, day, bits]);
});

describe("anonymous boundary", () => {
  it("rout_app without a session sees no rows, but the public function returns the type", async () => {
    await db.exec("grant select on public.booking_event_types to rout_app");
    await db.exec("begin; set local role rout_app;");
    try {
      const hidden = await db.query("select id from public.booking_event_types");
      expect(hidden.rows).toHaveLength(0);
      const pub = await db.query<{ r: Record<string, unknown> }>("select public.rout_booking_public_event_type($1::uuid) as r", [SOLO]);
      expect(pub.rows[0]!.r["title"]).toBe("Intro");
      expect(pub.rows[0]!.r["hostName"]).toBe("Ann Host");
      expect(JSON.stringify(pub.rows[0]!.r)).not.toContain(A);
    } finally { await db.exec("rollback"); }
  });

  it("the profile widget finds the first public type of a handle", async () => {
    const r = await db.query<{ id: string }>("select id from public.rout_booking_public_type_for_handle('ANN', null)");
    expect(r.rows[0]?.id).toBe(SOLO);
  });

  it("public days expose host ordinals, never host ids", async () => {
    const r = await db.query<Record<string, unknown>>("select * from public.rout_booking_public_days($1::uuid, $2::date, $2::date)", [TEAM, day]);
    expect(r.rows.map((x) => x["host_ordinal"])).toEqual([1, 2]);
    expect(JSON.stringify(r.rows)).not.toContain(A);
  });

  it("an inactive or banned owner's type is invisible and unbookable", async () => {
    await db.exec(`update public.profiles set is_banned = true where id = '${A}'`);
    try {
      const pub = await db.query<{ r: unknown }>("select public.rout_booking_public_event_type($1::uuid) as r", [SOLO]);
      expect(pub.rows[0]!.r).toBeNull();
      expect((await create(SOLO, at("10:00")))["reason"]).toBe("inactive");
    } finally { await db.exec(`update public.profiles set is_banned = false where id = '${A}'`); }
  });
});

describe("booking rules enforced in the database", () => {
  it("books inside availability and rejects the same block twice", async () => {
    const first = await create(SOLO, at("10:00"));
    expect(first["ok"]).toBe(true);
    expect(first["status"]).toBe("confirmed");
    expect(String(first["token"])).toMatch(/^[a-f0-9]{64}$/);
    expect((await create(SOLO, at("10:00"), "Eve"))["reason"]).toBe("slot_taken");
    // 10:30 falls in the 15-minute after-buffer of the first booking.
    expect((await create(SOLO, at("10:30"), "Eve"))["reason"]).toBe("slot_taken");
    expect((await create(SOLO, at("10:45"), "Eve"))["ok"]).toBe(true);
  });

  it("refuses starts outside the cached working hours", async () => {
    expect((await create(SOLO, at("07:00")))["ok"]).toBe(false);
    // 17:30 + 30 min + 15 min buffer runs past 18:00.
    expect((await create(SOLO, at("17:30")))["ok"]).toBe(false);
    expect((await create(SOLO, at("17:15")))["ok"]).toBe(true);
  });

  it("refuses starts off the step grid, too soon or too far", async () => {
    expect((await create(SOLO, at("10:07")))["reason"]).toBe("outside_availability");
    const soon = new Date(Date.now() + 3600000);
    soon.setUTCMinutes(0, 0, 0);
    expect((await create(SOLO, soon.toISOString()))["reason"]).toBe("too_soon");
    expect((await create(SOLO, new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10) + "T10:00:00Z"))["reason"]).toBe("too_far");
  });

  it("derives status from the type: paid types start as a 30-minute payment hold", async () => {
    const r = await create(PAID, at("11:00"));
    expect(r["status"]).toBe("pending_payment");
    expect(r["holdExpiresAt"]).not.toBeNull();
  });

  it("shared capacity admits exactly the configured number of guests", async () => {
    expect((await create(SEATS, at("12:00"), "One"))["ok"]).toBe(true);
    expect((await create(SEATS, at("12:00"), "Two"))["ok"]).toBe(true);
    expect((await create(SEATS, at("12:00"), "Three"))["reason"]).toBe("slot_taken");
  });

  it("round robin picks the host with fewer booked minutes, then falls back", async () => {
    const first = await create(TEAM, at("09:00"));
    const second = await create(TEAM, at("09:00"), "Eve");
    expect(first["ok"]).toBe(true);
    expect(second["ok"]).toBe(true);
    expect((first["hostIds"] as string[])[0]).not.toBe((second["hostIds"] as string[])[0]);
    expect((await create(TEAM, at("09:00"), "Zed"))["reason"]).toBe("slot_taken");
  });

  it("collective needs every host free and creates one row per host", async () => {
    const r = await create(COLL, at("13:00"));
    expect(r["ok"]).toBe(true);
    expect((r["bookingIds"] as string[]).length).toBe(2);
    await create(SOLO, at("15:00"));
    expect((await create(COLL, at("15:00")))["reason"]).toBe("slot_taken");
  });

  it("validates guest input in SQL as well", async () => {
    const r = await db.query<{ r: Record<string, unknown> }>(
      "select public.rout_booking_create($1::uuid, $2::timestamptz, '', 'x', 'Europe/Brussels', null, null) as r", [SOLO, at("10:00")]);
    expect(r.rows[0]!.r["reason"]).toBe("invalid_input");
  });
});

describe("group lifecycle and guest access", () => {
  it("release and paid confirmation always act on the whole collective group", async () => {
    await db.exec(`update public.booking_event_types set price_cents = 2000 where id = '${COLL}'`);
    try {
      const r = await create(COLL, at("14:00"));
      const [first, second] = r["bookingIds"] as string[];
      expect((await db.query("select public.rout_booking_set_checkout($1::uuid, 'cs_test_abcdefgh') as ok", [first])).rows).toHaveLength(1);
      const wrong = await db.query<{ r: Record<string, unknown> }>("select public.rout_booking_confirm_paid($1::uuid, 'cs_test_other123') as r", [first]);
      expect(wrong.rows[0]!.r["status"]).toBe("noop");
      const ok = await db.query<{ r: Record<string, unknown> }>("select public.rout_booking_confirm_paid($1::uuid, 'cs_test_abcdefgh') as r", [first]);
      expect(ok.rows[0]!.r["status"]).toBe("confirmed");
      const statuses = await db.query<{ status: string }>("select status from public.bookings where id = any($1::uuid[])", [[first, second]]);
      expect(statuses.rows.map((x) => x.status)).toEqual(["confirmed", "confirmed"]);
      const again = await create(COLL, at("16:00"));
      const n = await db.query<{ n: number }>("select public.rout_booking_release_hold($1::uuid) as n", [(again["bookingIds"] as string[])[1]]);
      expect(n.rows[0]!.n).toBe(2);
    } finally { await db.exec(`update public.booking_event_types set price_cents = null where id = '${COLL}'`); }
  });

  it("guest view masks everything but the status without the token", async () => {
    const r = await create(SOLO, at("10:00"));
    const id = (r["bookingIds"] as string[])[0];
    const masked = await db.query<{ v: Record<string, unknown> }>("select public.rout_booking_guest_view($1::uuid, $2) as v", [id, "0".repeat(64)]);
    expect(masked.rows[0]!.v).toEqual({ id, status: "confirmed", masked: true });
    for (const bad of [null, "kort", "A".repeat(64)]) {
      const v = await db.query<{ v: Record<string, unknown> }>("select public.rout_booking_guest_view($1::uuid, $2) as v", [id, bad]);
      expect(v.rows[0]!.v["masked"]).toBe(true);
    }
    const open = await db.query<{ v: Record<string, unknown> }>("select public.rout_booking_guest_view($1::uuid, $2) as v", [id, r["token"]]);
    expect(open.rows[0]!.v["guestName"]).toBe("Ann");
    expect(open.rows[0]!.v["masked"]).toBe(false);
  });

  it("rout_app may call the entry points but not the internal building blocks", async () => {
    await db.exec("begin; set local role rout_app;");
    try {
      await expect(db.query("select public.rout_booking_cache_free($1::uuid, now(), now() + interval '1 hour')", [A])).rejects.toThrow(/permission denied/);
    } finally { await db.exec("rollback"); }
    await db.exec("begin; set local role rout_app;");
    try {
      const r = await db.query<{ r: Record<string, unknown> }>(
        "select public.rout_booking_create($1::uuid, $2::timestamptz, 'Ann', 'ann@example.com', 'Europe/Brussels', null, null) as r", [SOLO, at("11:00")]);
      expect(r.rows[0]!.r["ok"]).toBe(true);
    } finally { await db.exec("rollback"); }
  });
});
