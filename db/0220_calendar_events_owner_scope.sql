-- 0220: calendar_events is read and written only for the calendar's owner.
--
-- 0154 gave every server-only table without a policy one permissive
-- `rout_server` policy for rout_app. calendar_events holds per-member busy
-- times (start/end + an HMAC of the provider id, no titles), and every access
-- already runs inside withDbContext as the calendar's owner (recompute,
-- calendar sync, "sync now"); the public booking checks read it through
-- SECURITY DEFINER functions. So the open policy is replaced by the owner
-- scope connected_calendars already has. Idempotent.
do $$
begin
  if to_regclass('public.calendar_events') is null then return; end if;
  execute 'alter table public.calendar_events enable row level security';
  execute 'drop policy if exists rout_server on public.calendar_events';
  execute 'drop policy if exists rout_scope on public.calendar_events';
  execute $p$create policy rout_scope on public.calendar_events
    using (exists (select 1 from public.connected_calendars c
                   where c.id = calendar_events.calendar_id and c.user_id = public.rout_current_user_id()))
    with check (exists (select 1 from public.connected_calendars c
                        where c.id = calendar_events.calendar_id and c.user_id = public.rout_current_user_id()))$p$;
end $$;
