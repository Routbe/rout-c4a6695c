-- 0218 — Booking engine phase 2: slot soft-locks, scheduling limits and gap-free slots.
--
--   * booking_holds: clicking a slot reserves it for 5 minutes. Holds live on the same
--     (host, UTC day) advisory locks as bookings, carry a secret only the holder knows
--     (stored as sha256), are capped at 3 live holds per client and count against
--     overlap, seats and limits for everyone else. GiST keeps non-shared holds apart.
--   * limits per day / week / month (per host, in the type's zone; week = ISO Monday),
--     a cap of active future bookings per guest e-mail, a rolling horizon counted in
--     business days (Mon–Fri) and "adjacent only" starts that never leave gaps.
--   * rout_booking_create gains (hold, secret); the 7-argument form stays as a wrapper.
-- Every rule is enforced here; the slot list only mirrors it. Idempotent.

alter table public.booking_event_types
  add column if not exists limit_per_day integer,
  add column if not exists limit_per_week integer,
  add column if not exists limit_per_month integer,
  add column if not exists limit_per_guest integer,
  add column if not exists horizon_business_days integer,
  add column if not exists adjacent_only boolean not null default false,
  add column if not exists rules_timezone text;
do $$ begin
  alter table public.booking_event_types add constraint booking_event_types_phase2_ranges check (
    (limit_per_day is null or limit_per_day between 1 and 200)
    and (limit_per_week is null or limit_per_week between 1 and 1000)
    and (limit_per_month is null or limit_per_month between 1 and 5000)
    and (limit_per_guest is null or limit_per_guest between 1 and 50)
    and (horizon_business_days is null or horizon_business_days between 1 and 260)
    and (rules_timezone is null or char_length(rules_timezone) between 1 and 64));
exception when duplicate_object then null; end $$;

create table if not exists public.booking_holds (
  hold_id uuid not null,
  host_user_id uuid not null references public.users (id) on delete cascade,
  event_type_id uuid not null references public.booking_event_types (id) on delete cascade,
  start_utc timestamptz not null,
  block_start_utc timestamptz not null,
  block_end_utc timestamptz not null,
  shared_slot boolean not null default false,
  secret_digest bytea not null check (octet_length(secret_digest) = 32),
  client_digest bytea not null check (octet_length(client_digest) = 32),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (hold_id, host_user_id),
  check (block_end_utc > block_start_utc and block_start_utc <= start_utc and expires_at > created_at)
);
do $$ begin
  alter table public.booking_holds add constraint booking_holds_no_overlap exclude using gist (
    host_user_id with =, tstzrange(block_start_utc, block_end_utc, '[)') with &&
  ) where (not shared_slot);
exception when duplicate_object or duplicate_table then null; end $$;
create index if not exists booking_holds_host_time on public.booking_holds (host_user_id, block_start_utc);
create index if not exists booking_holds_expiry on public.booking_holds (expires_at);
create index if not exists booking_holds_client on public.booking_holds (client_digest, expires_at);

-- Holds carry no guest data. Hosts may read the holds on their own timeline; every
-- write goes through the definer functions below.
alter table public.booking_holds enable row level security;
revoke all on public.booking_holds from public;
drop policy if exists rout_owner_read on public.booking_holds;
create policy rout_owner_read on public.booking_holds for select
  using (host_user_id = public.rout_current_user_id());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.booking_holds from rout_app;
    grant select on public.booking_holds to rout_app;
  end if;
end $$;

-- ---------- building blocks (internal) ----------

-- The zone a type's calendar periods and business days are counted in.
create or replace function public.rout_booking_zone(p_zone text, p_host uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select p_zone where p_zone is not null and exists (select 1 from pg_timezone_names z where z.name = p_zone)),
    (select r.timezone from public.availability_rules r
      where r.user_id = p_host and exists (select 1 from pg_timezone_names z where z.name = r.timezone)
      order by r.weekday, r.start_minute, r.id limit 1),
    'UTC')
$$;

-- The type's zone for type-wide rules (horizon): own zone, else the first host's.
create or replace function public.rout_booking_type_zone(p_event_type uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select public.rout_booking_zone(t.rules_timezone,
    coalesce(t.user_id, (select h.user_id from public.booking_event_type_hosts h where h.event_type_id = t.id
      order by h.priority desc, h.user_id limit 1)))
  from public.booking_event_types t where t.id = p_event_type
$$;

-- Last bookable instant (exclusive). Business days: Mon–Fri in p_zone, today counts
-- when it is one; the window ends at local midnight after the n-th business day.
-- Never beyond max_days_ahead (the cached horizon).
create or replace function public.rout_booking_horizon_end(p_business_days integer, p_max_days integer, p_zone text, p_now timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d date; n integer := 0; cap timestamptz := p_now + make_interval(days => p_max_days);
begin
  if p_business_days is null then return cap; end if;
  d := (p_now at time zone p_zone)::date;
  loop
    if extract(isodow from d) < 6 then n := n + 1; end if;
    exit when n >= p_business_days;
    d := d + 1;
  end loop;
  return least(cap, ((d + 1)::timestamp) at time zone p_zone);
end $$;

-- A 15-minute edge slot is taken: cache says busy (or missing) or an active booking covers it.
create or replace function public.rout_booking_edge_busy(p_host uuid, p_from timestamptz, p_to timestamptz)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not public.rout_booking_cache_free(p_host, p_from, p_to)
    or exists (select 1 from public.bookings b where b.host_user_id = p_host
      and b.status in ('held','pending_payment','requested','confirmed')
      and tstzrange(b.block_start_utc, b.block_end_utc, '[)') && tstzrange(p_from, p_to, '[)'))
$$;

-- Gap-free: the block touches something taken (or the edge of working hours) on either side.
-- Slot indices match the bitmap: floor(block start), ceil(block end) on the 15-minute grid.
create or replace function public.rout_booking_adjacent_ok(p_host uuid, p_block_start timestamptz, p_block_end timestamptz)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  with g as (select floor(extract(epoch from p_block_start) / 900)::bigint as a, ceil(extract(epoch from p_block_end) / 900)::bigint as b)
  select public.rout_booking_edge_busy(p_host, to_timestamp((g.a - 1) * 900), to_timestamp(g.a * 900))
      or public.rout_booking_edge_busy(p_host, to_timestamp(g.b * 900), to_timestamp((g.b + 1) * 900))
  from g
$$;

-- Live freedom including other visitors' holds; seats count bookings + holds together.
create or replace function public.rout_booking_host_free_held(p_host uuid, p_event_type uuid, p_start timestamptz,
  p_block_start timestamptz, p_block_end timestamptz, p_capacity integer, p_hold uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.rout_booking_host_free(p_host, p_event_type, p_start, p_block_start, p_block_end, p_capacity)
    and not exists (
      select 1 from public.booking_holds x where x.host_user_id = p_host and x.expires_at > now()
        and x.hold_id is distinct from p_hold
        and tstzrange(x.block_start_utc, x.block_end_utc, '[)') && tstzrange(p_block_start, p_block_end, '[)')
        and not (p_capacity > 1 and x.shared_slot and x.event_type_id = p_event_type and x.start_utc = p_start))
    and (p_capacity <= 1 or (
      (select count(*) from public.bookings b where b.host_user_id = p_host and b.shared_slot
        and b.event_type_id = p_event_type and b.start_utc = p_start
        and b.status in ('held','pending_payment','requested','confirmed'))
      + (select count(*) from public.booking_holds x where x.host_user_id = p_host and x.shared_slot
        and x.event_type_id = p_event_type and x.start_utc = p_start and x.expires_at > now()
        and x.hold_id is distinct from p_hold)) < p_capacity)
$$;

-- Meetings of this type for this host (bookings + live holds of others) in the calendar
-- period containing p_start stay under each limit. A shared start is one meeting, and
-- joining a shared start that already has a booking never adds one.
create or replace function public.rout_booking_within_limits(p_event_type uuid, p_host uuid, p_start timestamptz, p_hold uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  t public.booking_event_types%rowtype; zone text; wall timestamp; unit text; lim integer;
  ps timestamptz; pe timestamptz; n integer;
begin
  select * into t from public.booking_event_types where id = p_event_type;
  if t.limit_per_day is null and t.limit_per_week is null and t.limit_per_month is null then return true; end if;
  if greatest(1, t.resource_capacity) > 1 and exists (
      select 1 from public.bookings b where b.host_user_id = p_host and b.event_type_id = t.id and b.shared_slot
        and b.start_utc = p_start and b.status in ('held','pending_payment','requested','confirmed')) then
    return true;
  end if;
  zone := public.rout_booking_zone(t.rules_timezone, p_host);
  wall := p_start at time zone zone;
  foreach unit in array array['day', 'week', 'month'] loop
    lim := case unit when 'day' then t.limit_per_day when 'week' then t.limit_per_week else t.limit_per_month end;
    continue when lim is null;
    ps := date_trunc(unit, wall) at time zone zone;
    pe := (date_trunc(unit, wall) + ('1 ' || unit)::interval) at time zone zone;
    select count(*) into n from (
      select case when b.shared_slot then 'S' || b.start_utc::text else b.id::text end
      from public.bookings b where b.host_user_id = p_host and b.event_type_id = t.id
        and b.status in ('held','pending_payment','requested','confirmed') and b.start_utc >= ps and b.start_utc < pe
      union
      select case when x.shared_slot then 'S' || x.start_utc::text else 'H' || x.hold_id::text end
      from public.booking_holds x where x.host_user_id = p_host and x.event_type_id = t.id and x.expires_at > now()
        and x.hold_id is distinct from p_hold and x.start_utc >= ps and x.start_utc < pe) keys;
    if n >= lim then return false; end if;
  end loop;
  return true;
end $$;

-- Start-level rules shared by hold and create: grid, notice, horizon. Null = fine.
create or replace function public.rout_booking_start_problem(p_event_type uuid, p_start timestamptz)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t public.booking_event_types%rowtype;
begin
  select * into t from public.booking_event_types where id = p_event_type;
  if p_start is null or extract(epoch from p_start) % (t.slot_step_minutes * 60) <> 0 then return 'outside_availability'; end if;
  if p_start < now() + make_interval(hours => t.minimum_notice_hours) then return 'too_soon'; end if;
  if p_start >= public.rout_booking_horizon_end(t.horizon_business_days, t.max_days_ahead,
      public.rout_booking_type_zone(t.id), now()) then return 'too_far'; end if;
  return null;
end $$;

-- Host choice shared by hold and create. COLLECTIVE: every host must pass; otherwise the
-- first passing candidate (STRICT = top priority only; ROUND_ROBIN = fewest booked minutes
-- in the 30 days around the slot, then priority, then id). Null = nobody can take it.
create or replace function public.rout_booking_pick_hosts(p_event_type uuid, p_start timestamptz, p_hold uuid)
returns uuid[] language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  t public.booking_event_types%rowtype; bs timestamptz; be timestamptz; cap integer;
  hosts uuid[]; candidates uuid[]; h uuid;
begin
  select * into t from public.booking_event_types where id = p_event_type;
  bs := p_start - make_interval(mins => t.buffer_before_minutes);
  be := p_start + make_interval(mins => t.duration_minutes + t.buffer_after_minutes);
  cap := greatest(1, t.resource_capacity);
  if t.routing_strategy = 'COLLECTIVE' then
    select array_agg(user_id order by user_id) into hosts from public.booking_event_type_hosts where event_type_id = t.id;
    foreach h in array hosts loop
      if not (public.rout_booking_host_free_held(h, t.id, p_start, bs, be, cap, p_hold)
          and public.rout_booking_within_limits(t.id, h, p_start, p_hold)
          and (not t.adjacent_only or public.rout_booking_adjacent_ok(h, bs, be))) then
        return null;
      end if;
    end loop;
    return hosts;
  end if;
  select array_agg(x.user_id order by x.load, x.priority desc, x.user_id) into candidates from (
    select h2.user_id, h2.priority,
      case when t.routing_strategy = 'ROUND_ROBIN' then coalesce((
        select sum(extract(epoch from (b.end_utc - b.start_utc)) / 60) from public.bookings b
        where b.host_user_id = h2.user_id and b.status in ('held','pending_payment','requested','confirmed')
          and b.start_utc >= p_start - interval '30 days' and b.start_utc < p_start + interval '30 days'), 0) else 0 end as load
    from public.booking_event_type_hosts h2 where h2.event_type_id = t.id) x;
  if t.routing_strategy = 'STRICT' then candidates := candidates[1:1]; end if;
  foreach h in array coalesce(candidates, '{}') loop
    if public.rout_booking_host_free_held(h, t.id, p_start, bs, be, cap, p_hold)
        and public.rout_booking_within_limits(t.id, h, p_start, p_hold)
        and (not t.adjacent_only or public.rout_booking_adjacent_ok(h, bs, be)) then
      return array[h];
    end if;
  end loop;
  return null;
end $$;

-- Lock the type's hosts for the block of p_start and drop their expired holds.
create or replace function public.rout_booking_lock_type(p_event_type uuid, p_start timestamptz)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t public.booking_event_types%rowtype; hosts uuid[]; bs timestamptz; be timestamptz;
begin
  select * into t from public.booking_event_types where id = p_event_type;
  select array_agg(user_id order by user_id) into hosts from public.booking_event_type_hosts where event_type_id = t.id;
  bs := p_start - make_interval(mins => t.buffer_before_minutes);
  be := p_start + make_interval(mins => t.duration_minutes + t.buffer_after_minutes);
  perform public.rout_booking_lock_hosts(hosts, bs, be);
  delete from public.booking_holds x where x.host_user_id = any(hosts) and x.expires_at <= now();
end $$;

-- ---------- entry points ----------

-- Soft-lock a start for 5 minutes. p_client = sha256 hex of the visitor's network
-- identity (server-side); p_replace/p_replace_secret release the visitor's previous hold.
create or replace function public.rout_booking_hold(p_event_type uuid, p_start timestamptz, p_client text,
  p_replace uuid, p_replace_secret text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  t public.booking_event_types%rowtype; problem text; chosen uuid[]; h uuid;
  secret text := encode(gen_random_bytes(32), 'hex'); hid uuid := gen_random_uuid();
  exp timestamptz := now() + interval '5 minutes'; client bytea; bs timestamptz; be timestamptz;
begin
  if not public.rout_booking_type_public(p_event_type) then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  if p_client is null or p_client !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok', false, 'reason', 'invalid_input'); end if;
  client := decode(p_client, 'hex');
  select * into t from public.booking_event_types where id = p_event_type;
  if p_replace is not null and p_replace_secret ~ '^[a-f0-9]{64}$' then
    delete from public.booking_holds where hold_id = p_replace and secret_digest = sha256(convert_to(p_replace_secret, 'UTF8'));
  end if;
  problem := public.rout_booking_start_problem(t.id, p_start);
  if problem is not null then return jsonb_build_object('ok', false, 'reason', problem); end if;
  if (select count(distinct hold_id) from public.booking_holds where client_digest = client and expires_at > now()) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_holds');
  end if;
  perform public.rout_booking_lock_type(t.id, p_start);
  chosen := public.rout_booking_pick_hosts(t.id, p_start, null);
  if chosen is null then return jsonb_build_object('ok', false, 'reason', 'slot_taken'); end if;
  bs := p_start - make_interval(mins => t.buffer_before_minutes);
  be := p_start + make_interval(mins => t.duration_minutes + t.buffer_after_minutes);
  begin
    foreach h in array chosen loop
      insert into public.booking_holds (hold_id, host_user_id, event_type_id, start_utc, block_start_utc, block_end_utc,
        shared_slot, secret_digest, client_digest, expires_at)
      values (hid, h, t.id, p_start, bs, be, greatest(1, t.resource_capacity) > 1,
        sha256(convert_to(secret, 'UTF8')), client, exp);
    end loop;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end;
  return jsonb_build_object('ok', true, 'holdId', hid, 'secret', secret, 'expiresAt', exp, 'startUtc', p_start);
end $$;

create or replace function public.rout_booking_hold_release(p_hold uuid, p_secret text)
returns boolean language sql volatile security definer set search_path = public, pg_temp as $$
  with d as (delete from public.booking_holds where hold_id = p_hold and p_secret ~ '^[a-f0-9]{64}$'
    and secret_digest = sha256(convert_to(p_secret, 'UTF8')) returning 1)
  select count(*) > 0 from d
$$;

-- The booking. With a live hold of the caller, exactly the held hosts are booked (the
-- promise made at hold time; only live conflicts such as a new calendar event refuse it).
-- Without one (or expired), the regular choice applies. Returns {ok, reason} or
-- {ok, bookingIds, hostIds, token, status, holdExpiresAt, groupId}.
create or replace function public.rout_booking_create(p_event_type uuid, p_start timestamptz,
  p_guest_name text, p_guest_email text, p_guest_timezone text, p_guest_note text, p_intake jsonb,
  p_hold uuid, p_hold_secret text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  t public.booking_event_types%rowtype; problem text; chosen uuid[]; held uuid[];
  bs timestamptz; be timestamptz; e timestamptz; cap integer; shared boolean; st text; hold timestamptz;
  grp uuid; ids uuid[] := '{}'; tok text; h uuid; i integer; new_id uuid; own uuid;
begin
  if not public.rout_booking_type_public(p_event_type) then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  select * into t from public.booking_event_types where id = p_event_type;
  if p_guest_name is null or char_length(btrim(p_guest_name)) not between 1 and 120
     or p_guest_email is null or char_length(p_guest_email) not between 3 and 254 or position('@' in p_guest_email) < 2
     or p_guest_timezone is null or char_length(p_guest_timezone) not between 1 and 64
     or char_length(coalesce(p_guest_note, '')) > 2000
     or (p_intake is not null and (jsonb_typeof(p_intake) <> 'object' or octet_length(p_intake::text) > 65536)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;
  problem := public.rout_booking_start_problem(t.id, p_start);
  if problem is not null then return jsonb_build_object('ok', false, 'reason', problem); end if;

  e := p_start + make_interval(mins => t.duration_minutes);
  bs := p_start - make_interval(mins => t.buffer_before_minutes);
  be := e + make_interval(mins => t.buffer_after_minutes);
  cap := greatest(1, t.resource_capacity);
  shared := cap > 1;
  st := case when t.price_cents is not null then 'pending_payment' when t.confirmation_mode = 'request' then 'requested' else 'confirmed' end;
  hold := case when t.price_cents is not null then now() + interval '30 minutes' end;

  perform public.rout_booking_lock_type(t.id, p_start);

  -- Per-guest cap on active future bookings of this type (a collective group counts once).
  if t.limit_per_guest is not null and (
      select count(distinct coalesce(b.group_id, b.id)) from public.bookings b
      where b.event_type_id = t.id and lower(b.guest_email) = lower(p_guest_email) and b.end_utc > now()
        and b.status in ('held','pending_payment','requested','confirmed')) >= t.limit_per_guest then
    return jsonb_build_object('ok', false, 'reason', 'guest_limit');
  end if;

  if p_hold is not null and p_hold_secret ~ '^[a-f0-9]{64}$' then
    select array_agg(x.host_user_id order by x.host_user_id) into held from public.booking_holds x
    where x.hold_id = p_hold and x.event_type_id = t.id and x.start_utc = p_start and x.expires_at > now()
      and x.secret_digest = sha256(convert_to(p_hold_secret, 'UTF8'));
  end if;
  if held is not null then
    own := p_hold;
    foreach h in array held loop
      if not public.rout_booking_host_free_held(h, t.id, p_start, bs, be, cap, own) then
        return jsonb_build_object('ok', false, 'reason', 'slot_taken');
      end if;
    end loop;
    chosen := held;
  else
    chosen := public.rout_booking_pick_hosts(t.id, p_start, null);
    if chosen is null then return jsonb_build_object('ok', false, 'reason', 'slot_taken'); end if;
  end if;

  if own is not null then delete from public.booking_holds where hold_id = own; end if;
  grp := case when array_length(chosen, 1) > 1 then gen_random_uuid() end;
  begin
    for i in 1 .. array_length(chosen, 1) loop
      new_id := gen_random_uuid();
      insert into public.bookings (id, event_type_id, host_user_id, workspace_id, group_id, start_utc, end_utc,
        block_start_utc, block_end_utc, status, guest_name, guest_email, guest_timezone, guest_note, hold_expires_at,
        ics_uid, shared_slot, intake_answers)
      values (new_id, t.id, chosen[i], t.workspace_id, grp, p_start, e, bs, be, st, btrim(p_guest_name), p_guest_email,
        p_guest_timezone, nullif(p_guest_note, ''), hold, coalesce(grp, new_id)::text || '@rout.be', shared, p_intake);
      ids := ids || new_id;
      insert into public.availability_jobs (user_id, reason, run_after) values (chosen[i], 'booking', now() + interval '20 seconds')
        on conflict (user_id) do update set reason = 'booking', run_after = least(public.availability_jobs.run_after, excluded.run_after);
    end loop;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end;
  select booking_token into tok from public.bookings where id = ids[1];
  return jsonb_build_object('ok', true, 'bookingIds', to_jsonb(ids), 'hostIds', to_jsonb(chosen), 'token', tok,
    'status', st, 'holdExpiresAt', hold, 'groupId', grp);
end $$;

-- Callers of the 0216 form keep working and now respect holds, limits and horizons.
create or replace function public.rout_booking_create(p_event_type uuid, p_start timestamptz,
  p_guest_name text, p_guest_email text, p_guest_timezone text, p_guest_note text, p_intake jsonb)
returns jsonb language sql volatile security definer set search_path = public, pg_temp as $$
  select public.rout_booking_create(p_event_type, p_start, p_guest_name, p_guest_email, p_guest_timezone,
    p_guest_note, p_intake, null::uuid, null::text)
$$;

-- What the slot list must leave out besides the cached bits, per host ordinal:
--   'busy'  = other visitors' live holds (block ranges), never their ids or secrets
--   'limit' = calendar periods [start, end) in which the host reached a limit of this type
create or replace function public.rout_booking_public_constraints(p_id uuid, p_from timestamptz, p_to timestamptz, p_hold uuid)
returns table(host_ordinal integer, kind text, start_utc timestamptz, end_utc timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t public.booking_event_types%rowtype; r record; unit text; lim integer; zone text;
begin
  if not public.rout_booking_type_public(p_id) then return; end if;
  select * into t from public.booking_event_types where id = p_id;
  if p_to > p_from + interval '400 days' then p_to := p_from + interval '400 days'; end if;
  for r in select h.user_id, row_number() over (order by h.user_id)::integer as ord
      from public.booking_event_type_hosts h where h.event_type_id = p_id loop
    return query select r.ord, 'busy'::text, x.block_start_utc, x.block_end_utc
      from public.booking_holds x where x.host_user_id = r.user_id and x.expires_at > now()
        and x.hold_id is distinct from p_hold and x.block_end_utc > p_from and x.block_start_utc < p_to
        and not (greatest(1, t.resource_capacity) > 1 and x.shared_slot and x.event_type_id = p_id);
    zone := public.rout_booking_zone(t.rules_timezone, r.user_id);
    foreach unit in array array['day', 'week', 'month'] loop
      lim := case unit when 'day' then t.limit_per_day when 'week' then t.limit_per_week else t.limit_per_month end;
      continue when lim is null;
      return query
        select r.ord, 'limit'::text, (q.p at time zone zone), ((q.p + ('1 ' || unit)::interval) at time zone zone)
        from (
          select date_trunc(unit, k.s at time zone zone) as p, count(distinct k.k) as n from (
            select b.start_utc as s, case when b.shared_slot then 'S' || b.start_utc::text else b.id::text end as k
            from public.bookings b where b.host_user_id = r.user_id and b.event_type_id = p_id
              and b.status in ('held','pending_payment','requested','confirmed')
              and b.start_utc >= p_from - interval '32 days' and b.start_utc < p_to + interval '32 days'
            union all
            select x.start_utc, case when x.shared_slot then 'S' || x.start_utc::text else 'H' || x.hold_id::text end
            from public.booking_holds x where x.host_user_id = r.user_id and x.event_type_id = p_id
              and x.expires_at > now() and x.hold_id is distinct from p_hold
              and x.start_utc >= p_from - interval '32 days' and x.start_utc < p_to + interval '32 days') k
          group by 1) q
        where q.n >= lim;
    end loop;
  end loop;
end $$;

-- Public type view: phase-2 rules, the live horizon end and the hold length.
create or replace function public.rout_booking_public_event_type(p_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.rout_booking_type_public(p_id) then (
    select jsonb_build_object(
      'id', t.id, 'title', t.title, 'description', t.description, 'durationMinutes', t.duration_minutes,
      'priceCents', t.price_cents, 'currency', t.currency, 'locationKind', t.location_kind,
      'confirmationMode', t.confirmation_mode, 'routingStrategy', t.routing_strategy,
      'minimumNoticeHours', t.minimum_notice_hours, 'maxDaysAhead', t.max_days_ahead,
      'slotStepMinutes', t.slot_step_minutes, 'bufferBeforeMinutes', t.buffer_before_minutes,
      'bufferAfterMinutes', t.buffer_after_minutes, 'workspaceId', t.workspace_id,
      'customFields', t.custom_fields, 'capacity', t.resource_capacity,
      'hostName', coalesce(w.name, p.display_name),
      'hostCount', (select count(*) from public.booking_event_type_hosts h where h.event_type_id = t.id),
      'adjacentOnly', t.adjacent_only, 'horizonBusinessDays', t.horizon_business_days,
      'horizonEndUtc', public.rout_booking_horizon_end(t.horizon_business_days, t.max_days_ahead,
        public.rout_booking_type_zone(t.id), now()),
      'holdMinutes', 5, 'phase', 2)
    from public.booking_event_types t
    left join public.workspaces w on w.id = t.workspace_id
    left join public.profiles p on p.id = t.user_id
    where t.id = p_id) end
$$;

-- Cron safety net: expired payment holds as before, plus expired soft-locks.
create or replace function public.rout_booking_release_expired(p_limit integer)
returns integer language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r record; n integer := 0; m integer;
begin
  for r in select id from public.bookings where status in ('held','pending_payment')
      and hold_expires_at < now() - interval '5 minutes' order by hold_expires_at limit least(greatest(p_limit, 1), 500) loop
    n := n + public.rout_booking_release_hold(r.id);
  end loop;
  delete from public.booking_holds where expires_at < now() - interval '1 minute';
  get diagnostics m = row_count;
  return n + m;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'rout_booking_zone(text, uuid)',
    'rout_booking_type_zone(uuid)',
    'rout_booking_horizon_end(integer, integer, text, timestamptz)',
    'rout_booking_edge_busy(uuid, timestamptz, timestamptz)',
    'rout_booking_adjacent_ok(uuid, timestamptz, timestamptz)',
    'rout_booking_host_free_held(uuid, uuid, timestamptz, timestamptz, timestamptz, integer, uuid)',
    'rout_booking_within_limits(uuid, uuid, timestamptz, uuid)',
    'rout_booking_start_problem(uuid, timestamptz)',
    'rout_booking_pick_hosts(uuid, timestamptz, uuid)',
    'rout_booking_lock_type(uuid, timestamptz)',
    'rout_booking_hold(uuid, timestamptz, text, uuid, text)',
    'rout_booking_hold_release(uuid, text)',
    'rout_booking_create(uuid, timestamptz, text, text, text, text, jsonb, uuid, text)',
    'rout_booking_create(uuid, timestamptz, text, text, text, text, jsonb)',
    'rout_booking_public_constraints(uuid, timestamptz, timestamptz, uuid)',
    'rout_booking_public_event_type(uuid)',
    'rout_booking_release_expired(integer)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    foreach f in array array[
      'rout_booking_zone(text, uuid)',
      'rout_booking_type_zone(uuid)',
      'rout_booking_horizon_end(integer, integer, text, timestamptz)',
      'rout_booking_edge_busy(uuid, timestamptz, timestamptz)',
      'rout_booking_adjacent_ok(uuid, timestamptz, timestamptz)',
      'rout_booking_host_free_held(uuid, uuid, timestamptz, timestamptz, timestamptz, integer, uuid)',
      'rout_booking_within_limits(uuid, uuid, timestamptz, uuid)',
      'rout_booking_start_problem(uuid, timestamptz)',
      'rout_booking_pick_hosts(uuid, timestamptz, uuid)',
      'rout_booking_lock_type(uuid, timestamptz)'
    ] loop
      execute format('revoke all on function public.%s from rout_app', f);
    end loop;
    foreach f in array array[
      'rout_booking_hold(uuid, timestamptz, text, uuid, text)',
      'rout_booking_hold_release(uuid, text)',
      'rout_booking_create(uuid, timestamptz, text, text, text, text, jsonb, uuid, text)',
      'rout_booking_create(uuid, timestamptz, text, text, text, text, jsonb)',
      'rout_booking_public_constraints(uuid, timestamptz, timestamptz, uuid)',
      'rout_booking_public_event_type(uuid)',
      'rout_booking_release_expired(integer)'
    ] loop
      execute format('grant execute on function public.%s to rout_app', f);
    end loop;
  end if;
end $$;
