-- 0219: the public slot list mirrors shared (group) sessions exactly as
-- rout_booking_host_free_held decides them.
--
-- A shared session = every live booking and every live soft-lock with
-- shared_slot at one (host, event type, start). The booking functions let a
-- guest join that exact start while seats remain, and refuse every other
-- start whose block overlaps it. The cached bitmap only marks a session busy
-- once its *bookings* fill it, so before this migration the slot list could
-- show (a) a start whose last seats are held by other visitors and (b) other
-- starts overlapping a partly filled session. rout_booking_create already
-- refused both; this only stops the list from offering them.
--
-- Read-only, additive, idempotent. Exposes no guest data: only time ranges and
-- whether the exact start is still open for p_id.

create or replace function public.rout_booking_public_sessions(p_id uuid, p_from timestamptz, p_to timestamptz, p_hold uuid)
returns table(host_ordinal integer, start_utc timestamptz, block_start_utc timestamptz, block_end_utc timestamptz, open boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare cap integer;
begin
  if not public.rout_booking_type_public(p_id) then return; end if;
  select greatest(1, t.resource_capacity) into cap from public.booking_event_types t where t.id = p_id;
  if p_to > p_from + interval '400 days' then p_to := p_from + interval '400 days'; end if;
  return query
    with hosts as (
      select h.user_id, row_number() over (order by h.user_id)::integer as ord
      from public.booking_event_type_hosts h where h.event_type_id = p_id
    ), seats as (
      select b.host_user_id as host, b.event_type_id as et, b.start_utc as s, b.block_start_utc as bs, b.block_end_utc as be
      from public.bookings b join hosts on hosts.user_id = b.host_user_id
      where b.shared_slot and b.status in ('held','pending_payment','requested','confirmed')
        and b.block_end_utc > p_from and b.block_start_utc < p_to
      union all
      select x.host_user_id, x.event_type_id, x.start_utc, x.block_start_utc, x.block_end_utc
      from public.booking_holds x join hosts on hosts.user_id = x.host_user_id
      where x.shared_slot and x.expires_at > now() and x.hold_id is distinct from p_hold
        and x.block_end_utc > p_from and x.block_start_utc < p_to
    )
    select hosts.ord, g.s, min(g.bs), max(g.be), (g.et = p_id and cap > 1 and count(*) < cap)
    from seats g join hosts on hosts.user_id = g.host
    group by hosts.ord, g.host, g.et, g.s;
end $$;

do $$ begin
  execute 'revoke all on function public.rout_booking_public_sessions(uuid, timestamptz, timestamptz, uuid) from public';
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    execute 'grant execute on function public.rout_booking_public_sessions(uuid, timestamptz, timestamptz, uuid) to rout_app';
  end if;
end $$;
