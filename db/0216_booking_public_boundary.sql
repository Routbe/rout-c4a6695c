-- 0216 — Booking engine public boundary.
--
-- Guests, Stripe webhooks and cron run without a member session, so rout_app's
-- RLS (owner/workspace scope) hides every booking row from them. Instead of
-- widening RLS, each anonymous capability gets one narrow SECURITY DEFINER
-- function that re-validates everything itself:
--   * slots: only per-host free bits (host ordinal, never a user id or guest data)
--   * create: event active, step grid, notice, horizon, cached availability over
--     the whole block range, live overlap/capacity/calendar checks, all under
--     advisory locks per (host, UTC day) for EVERY day the block touches
--   * paid / release: always the whole collective group, never one row
--   * guest view: only with the per-booking token (compared as sha256 digests)
-- Status and hold expiry are derived here from the event type, never from input.
-- Idempotent.

-- One lock key per host per UTC day; taken in (host, day) order everywhere.
create or replace function public.rout_booking_lock_hosts(p_hosts uuid[], p_from timestamptz, p_to timestamptz)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare h uuid; d date;
begin
  for h in select x from unnest(p_hosts) x group by x order by x loop
    d := (p_from at time zone 'utc')::date;
    while d <= ((p_to - interval '1 microsecond') at time zone 'utc')::date loop
      perform pg_advisory_xact_lock(hashtextextended('booking:' || h::text || ':' || d::text, 0));
      d := d + 1;
    end loop;
  end loop;
end $$;

-- Every 15-minute slot of [p_from, p_to) is free in the host's cached availability.
-- A missing cache day counts as busy (never book outside what was computed).
create or replace function public.rout_booking_cache_free(p_host uuid, p_from timestamptz, p_to timestamptz)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  first_slot bigint := floor(extract(epoch from p_from) / 900);
  last_slot bigint := ceil(extract(epoch from p_to) / 900);
  s bigint; day_start bigint; bits text; cur date; want date;
begin
  if p_to <= p_from then return false; end if;
  cur := null;
  for s in first_slot .. last_slot - 1 loop
    want := (to_timestamp(s * 900) at time zone 'utc')::date;
    if cur is distinct from want then
      select c.free_bits::text into bits from public.availability_cache c where c.user_id = p_host and c.day = want;
      if bits is null then return false; end if;
      cur := want;
      day_start := floor(extract(epoch from (want::timestamp at time zone 'utc')) / 900);
    end if;
    if substr(bits, (s - day_start + 1)::int, 1) <> '1' then return false; end if;
  end loop;
  return true;
end $$;

-- Live freedom of one host for one block (bookings, seats, blocking external events).
create or replace function public.rout_booking_host_free(p_host uuid, p_event_type uuid, p_start timestamptz,
  p_block_start timestamptz, p_block_end timestamptz, p_capacity integer)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.rout_booking_cache_free(p_host, p_block_start, p_block_end)
    and not exists (
      select 1 from public.bookings b where b.host_user_id = p_host
        and b.status in ('held','pending_payment','requested','confirmed')
        and tstzrange(b.block_start_utc, b.block_end_utc, '[)') && tstzrange(p_block_start, p_block_end, '[)')
        and not (p_capacity > 1 and b.shared_slot and b.event_type_id = p_event_type and b.start_utc = p_start))
    and (p_capacity <= 1 or (select count(*) from public.bookings b where b.host_user_id = p_host and b.shared_slot
        and b.event_type_id = p_event_type and b.start_utc = p_start
        and b.status in ('held','pending_payment','requested','confirmed')) < p_capacity)
    and not exists (
      select 1 from public.calendar_events ev join public.connected_calendars c on c.id = ev.calendar_id
      where c.user_id = p_host and ev.is_blocking and ev.start_utc < p_block_end and ev.end_utc > p_block_start)
$$;

-- An event type a visitor may see: active, has hosts, owner not banned/suspended/private.
create or replace function public.rout_booking_type_public(p_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.booking_event_types t
    left join public.profiles p on p.id = t.user_id
    where t.id = p_id and t.is_active
      and exists (select 1 from public.booking_event_type_hosts h where h.event_type_id = t.id)
      and (t.user_id is null or (p.id is not null
        and coalesce((p.display_prefs ->> 'publicProfile')::boolean, true)
        and not coalesce(p.is_banned, false) and not coalesce(p.is_suspended, false))))
$$;

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
      'hostCount', (select count(*) from public.booking_event_type_hosts h where h.event_type_id = t.id))
    from public.booking_event_types t
    left join public.workspaces w on w.id = t.workspace_id
    left join public.profiles p on p.id = t.user_id
    where t.id = p_id) end
$$;

-- Per-host cached days for a public type. Hosts are numbered 1..n by id; ids never leave.
create or replace function public.rout_booking_public_days(p_id uuid, p_from date, p_to date)
returns table(host_ordinal integer, day date, bits text, computed_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with hosts as (
    select h.user_id, row_number() over (order by h.user_id)::integer as ord
    from public.booking_event_type_hosts h where h.event_type_id = p_id
  )
  select hosts.ord, c.day, c.free_bits::text, c.computed_at
  from hosts join public.availability_cache c on c.user_id = hosts.user_id
  where public.rout_booking_type_public(p_id)
    and c.day between p_from and least(p_to, p_from + 400)
  order by c.day, hosts.ord
$$;

-- Profile widget: the first public type of a handle (optionally a specific one).
create or replace function public.rout_booking_public_type_for_handle(p_handle text, p_type uuid)
returns table(id uuid, title text) language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.title from public.booking_event_types t
  join public.profiles p on p.id = t.user_id
  where lower(p.username) = lower(p_handle) and (p_type is null or t.id = p_type)
    and public.rout_booking_type_public(t.id)
  order by t.created_at, t.id limit 1
$$;

-- Server-internal: hosts whose cache is missing or older than p_max_age (lazy refresh).
create or replace function public.rout_booking_stale_hosts(p_id uuid, p_max_age interval)
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(h.user_id order by h.user_id), '{}')
  from public.booking_event_type_hosts h
  where h.event_type_id = p_id and public.rout_booking_type_public(p_id)
    and coalesce((select max(c.computed_at) from public.availability_cache c where c.user_id = h.user_id), '-infinity') < now() - p_max_age
$$;

-- The booking itself. Returns {ok, reason} or {ok, bookingIds, hostIds, token, status, holdExpiresAt}.
create or replace function public.rout_booking_create(p_event_type uuid, p_start timestamptz,
  p_guest_name text, p_guest_email text, p_guest_timezone text, p_guest_note text, p_intake jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  t public.booking_event_types%rowtype;
  hosts uuid[]; candidates uuid[]; chosen uuid[];
  bs timestamptz; be timestamptz; e timestamptz;
  cap integer; shared boolean; st text; hold timestamptz;
  grp uuid; ids uuid[] := '{}'; tok text; h uuid; i integer; new_id uuid;
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
  if extract(epoch from p_start) % (t.slot_step_minutes * 60) <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'outside_availability');
  end if;
  if p_start < now() + make_interval(hours => t.minimum_notice_hours) then return jsonb_build_object('ok', false, 'reason', 'too_soon'); end if;
  if p_start > now() + make_interval(days => t.max_days_ahead) then return jsonb_build_object('ok', false, 'reason', 'too_far'); end if;

  e := p_start + make_interval(mins => t.duration_minutes);
  bs := p_start - make_interval(mins => t.buffer_before_minutes);
  be := e + make_interval(mins => t.buffer_after_minutes);
  cap := greatest(1, t.resource_capacity);
  shared := cap > 1;
  st := case when t.price_cents is not null then 'pending_payment' when t.confirmation_mode = 'request' then 'requested' else 'confirmed' end;
  hold := case when t.price_cents is not null then now() + interval '30 minutes' end;

  select array_agg(user_id order by user_id) into hosts from public.booking_event_type_hosts where event_type_id = t.id;
  -- Lock every host of the type for every UTC day the block touches, in global (host, day) order.
  perform public.rout_booking_lock_hosts(hosts, bs, be);

  if t.routing_strategy = 'COLLECTIVE' then
    foreach h in array hosts loop
      if not public.rout_booking_host_free(h, t.id, p_start, bs, be, cap) then
        return jsonb_build_object('ok', false, 'reason', 'slot_taken');
      end if;
    end loop;
    chosen := hosts;
  else
    -- STRICT: highest priority host. ROUND_ROBIN: free hosts, fewest booked minutes in the
    -- 30 days around the slot, then priority, then id (deterministic).
    select array_agg(x.user_id order by x.load, x.priority desc, x.user_id) into candidates from (
      select h2.user_id, h2.priority,
        case when t.routing_strategy = 'ROUND_ROBIN' then coalesce((
          select sum(extract(epoch from (b.end_utc - b.start_utc)) / 60) from public.bookings b
          where b.host_user_id = h2.user_id and b.status in ('held','pending_payment','requested','confirmed')
            and b.start_utc >= p_start - interval '30 days' and b.start_utc < p_start + interval '30 days'), 0) else 0 end as load
      from public.booking_event_type_hosts h2 where h2.event_type_id = t.id
    ) x;
    if t.routing_strategy = 'STRICT' then candidates := candidates[1:1]; end if;
    chosen := null;
    foreach h in array candidates loop
      if public.rout_booking_host_free(h, t.id, p_start, bs, be, cap) then chosen := array[h]; exit; end if;
    end loop;
    if chosen is null then return jsonb_build_object('ok', false, 'reason', 'slot_taken'); end if;
  end if;

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
  -- The guest link uses the first row's token; group actions resolve the whole group.
  select booking_token into tok from public.bookings where id = ids[1];
  return jsonb_build_object('ok', true, 'bookingIds', to_jsonb(ids), 'hostIds', to_jsonb(chosen), 'token', tok,
    'status', st, 'holdExpiresAt', hold, 'groupId', grp);
end $$;

-- Rows of the group a booking belongs to (itself when not collective).
create or replace function public.rout_booking_group_ids(p_booking uuid)
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(b.id order by b.id), '{}') from public.bookings b
  where b.id = p_booking or (b.group_id is not null and b.group_id = (select group_id from public.bookings where id = p_booking))
$$;

create or replace function public.rout_booking_set_checkout(p_booking uuid, p_session text)
returns boolean language sql volatile security definer set search_path = public, pg_temp as $$
  update public.bookings set stripe_checkout_session_id = p_session, updated_at = now()
  where id = p_booking and status = 'pending_payment' and stripe_checkout_session_id is null
    and p_session ~ '^cs_[A-Za-z0-9_]{8,250}$'
  returning true
$$;

-- Stripe paid: the whole group moves on, only with the session that was issued for it.
create or replace function public.rout_booking_confirm_paid(p_booking uuid, p_session text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ids uuid[] := public.rout_booking_group_ids(p_booking); st text; hs uuid[];
begin
  with u as (
    update public.bookings b set
      status = case when t.confirmation_mode = 'request' then 'requested' else 'confirmed' end,
      hold_expires_at = null, updated_at = now()
    from public.booking_event_types t
    where b.id = any(ids) and t.id = b.event_type_id and b.status = 'pending_payment'
      and exists (select 1 from public.bookings s where s.id = p_booking and s.stripe_checkout_session_id = p_session)
    returning b.status, b.host_user_id)
  select max(status), array_agg(host_user_id) into st, hs from u;
  return jsonb_build_object('status', coalesce(st, 'noop'), 'hostIds', coalesce(to_jsonb(hs), '[]'::jsonb), 'bookingId', p_booking);
end $$;

create or replace function public.rout_booking_release_hold(p_booking uuid)
returns integer language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  with u as (
    update public.bookings set status = 'cancelled', hold_expires_at = null, updated_at = now()
    where id = any(public.rout_booking_group_ids(p_booking)) and status in ('held','pending_payment')
    returning host_user_id),
  j as (
    insert into public.availability_jobs (user_id, reason) select distinct host_user_id, 'hold_released' from u
    on conflict (user_id) do update set run_after = least(public.availability_jobs.run_after, now())
    returning 1)
  select count(*) into n from u;
  return n;
end $$;

create or replace function public.rout_booking_release_expired(p_limit integer)
returns integer language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r record; n integer := 0;
begin
  for r in select id from public.bookings where status in ('held','pending_payment')
      and hold_expires_at < now() - interval '5 minutes' order by hold_expires_at limit least(greatest(p_limit, 1), 500) loop
    n := n + public.rout_booking_release_hold(r.id);
  end loop;
  return n;
end $$;

-- Guest view: details only with the booking token. Digests are compared, so a
-- wrong token learns nothing from timing. Without a token: status only.
create or replace function public.rout_booking_guest_view(p_booking uuid, p_token text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when b.id is null then null
    when p_token is null or p_token !~ '^[a-f0-9]{64}$' or b.booking_token is null
      or sha256(convert_to(p_token, 'UTF8')) <> sha256(convert_to(b.booking_token, 'UTF8'))
      then jsonb_build_object('id', b.id, 'status', b.status, 'masked', true)
    else jsonb_build_object('id', b.id, 'status', b.status, 'masked', false, 'title', t.title,
      'startUtc', b.start_utc, 'endUtc', b.end_utc, 'guestName', b.guest_name, 'guestEmail', b.guest_email,
      'guestTimezone', b.guest_timezone, 'locationKind', t.location_kind,
      'locationValue', case when b.status = 'confirmed' then t.location_value end,
      'hostName', coalesce(w.name, p.display_name), 'icsUid', b.ics_uid, 'sequence', b.sequence)
  end
  from (select 1) one
  left join public.bookings b on b.id = p_booking
  left join public.booking_event_types t on t.id = b.event_type_id
  left join public.workspaces w on w.id = b.workspace_id
  left join public.profiles p on p.id = b.host_user_id
$$;

-- Calendar sync due list for cron (ids + owner only; sync itself runs as the owner).
create or replace function public.rout_booking_due_calendars(p_limit integer)
returns table(id uuid, user_id uuid) language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.user_id from public.connected_calendars c
  where c.adapter in ('ics','caldav') and c.sync_status <> 'disconnected'
    and (c.last_synced_at is null or c.last_synced_at < now() - interval '10 minutes')
  order by c.last_synced_at nulls first limit least(greatest(p_limit, 1), 100)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'rout_booking_lock_hosts(uuid[], timestamptz, timestamptz)',
    'rout_booking_cache_free(uuid, timestamptz, timestamptz)',
    'rout_booking_host_free(uuid, uuid, timestamptz, timestamptz, timestamptz, integer)',
    'rout_booking_type_public(uuid)',
    'rout_booking_public_event_type(uuid)',
    'rout_booking_public_days(uuid, date, date)',
    'rout_booking_public_type_for_handle(text, uuid)',
    'rout_booking_stale_hosts(uuid, interval)',
    'rout_booking_create(uuid, timestamptz, text, text, text, text, jsonb)',
    'rout_booking_group_ids(uuid)',
    'rout_booking_set_checkout(uuid, text)',
    'rout_booking_confirm_paid(uuid, text)',
    'rout_booking_release_hold(uuid)',
    'rout_booking_release_expired(integer)',
    'rout_booking_guest_view(uuid, text)',
    'rout_booking_due_calendars(integer)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    -- Building blocks stay internal; rout_app gets only the entry points.
    foreach f in array array[
      'rout_booking_public_event_type(uuid)',
      'rout_booking_public_days(uuid, date, date)',
      'rout_booking_public_type_for_handle(text, uuid)',
      'rout_booking_stale_hosts(uuid, interval)',
      'rout_booking_create(uuid, timestamptz, text, text, text, text, jsonb)',
      'rout_booking_set_checkout(uuid, text)',
      'rout_booking_confirm_paid(uuid, text)',
      'rout_booking_release_hold(uuid)',
      'rout_booking_release_expired(integer)',
      'rout_booking_guest_view(uuid, text)',
      'rout_booking_due_calendars(integer)'
    ] loop
      execute format('grant execute on function public.%s to rout_app', f);
    end loop;
  end if;
end $$;
