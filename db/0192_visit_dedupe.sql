-- 0192: cross-instance visit de-duplication.
-- profile_visits is not readable by the public runtime role (RLS), so the
-- 30-minute dedupe check runs through a narrow definer function that only
-- answers yes/no for one visitor hash and never returns visit rows.
create or replace function public.rout_visit_seen_recently(p_hash text, p_handle text, p_space text)
returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.profile_visits
     where visitor_hash = p_hash and handle = p_handle and space = p_space
       and created_at > now() - interval '30 minutes'
  );
$$;
revoke all on function public.rout_visit_seen_recently(text, text, text) from public;
grant execute on function public.rout_visit_seen_recently(text, text, text) to rout_app;
create index if not exists profile_visits_dedupe on public.profile_visits (visitor_hash, handle, created_at desc);
