-- 0170 — After a personal account is converted into a workspace, its old
-- addresses (rout.be/<username> and rout.be/u/<alias>) keep working during the
-- 30-day sunset and point to the new workspace. Returns only the public
-- workspace slug, never account data. Idempotent.

create or replace function public.rout_migrated_workspace_for_handle(p_handle text, p_space text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select w.slug
    from public.users u
    join public.workspaces w on w.id = u.migrated_to_workspace_id
   where u.account_status = 'migrated_sunset'
     and u.sunset_at > now()
     and u.id = case
       when p_space = 'alias' then (select a.user_id from public.alias_profiles a where lower(a.handle) = lower(p_handle) limit 1)
       else (select p.id from public.profiles p where lower(p.username) = lower(p_handle) limit 1)
     end
   limit 1
$$;

revoke all on function public.rout_migrated_workspace_for_handle(text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_migrated_workspace_for_handle(text, text) to rout_app;
  end if;
end $$;
