-- 0217 — Booking building blocks are internal to the 0216 entry points.
-- Default privileges on the live database also granted them to rout_app; take
-- that back explicitly so the runtime role can only call the entry points.
-- Idempotent.
do $$
declare f text;
begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    foreach f in array array[
      'rout_booking_lock_hosts(uuid[], timestamptz, timestamptz)',
      'rout_booking_cache_free(uuid, timestamptz, timestamptz)',
      'rout_booking_host_free(uuid, uuid, timestamptz, timestamptz, timestamptz, integer)',
      'rout_booking_type_public(uuid)',
      'rout_booking_group_ids(uuid)'
    ] loop
      execute format('revoke all on function public.%s from rout_app', f);
    end loop;
  end if;
end $$;
