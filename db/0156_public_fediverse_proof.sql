-- Review and apply separately; never run owner migrations during deployment.
-- A fixed read-only capability exposes no email, identity id, or private content.
create or replace function public.read_public_fediverse(p_user uuid)
returns table(handle text, verified boolean, verified_at timestamptz, verify_code text, urls text[])
language sql stable security definer set search_path = pg_catalog, public as $$
  select i.handle, i.verified, i.verified_at, i.verify_code,
    array(select distinct v from (
      select 'https://rout.be/@' || p.username as v
      union all select 'https://rout.be/' || p.username
      union all select 'https://' || case
        when p.subdomain_tier='root_lifetime' and p.root_subdomain_status='active' then p.username || '.rout.be'
        when p.subdomain_tier in ('root_lifetime','pro') then p.username || '.r.rout.be'
        else coalesce(p.subdomain_alias,p.username) || '.u.rout.be' end
        where p.subdomain_enabled
      union all select 'https://' || d.domain from public.custom_domains d where d.user_id=p.id and d.status='verified'
    ) destinations where v is not null order by v)
  from public.user_integrations i
  join public.profiles p on p.id=i.user_id
  join public.users u on u.id=p.id
  where i.user_id=p_user and i.provider='mastodon' and i.visible
    and i.verify_code like 'relme:%' and u.email_confirmed_at is not null
    and p.username is not null and coalesce(p.is_banned,false)=false
    and coalesce(p.is_suspended,false)=false
    and coalesce(p.status,'active') not in ('frozen','banned','suspended')
    and coalesce((p.display_prefs->>'publicProfile')::boolean,true)
  limit 1
$$;
revoke all on function public.read_public_fediverse(uuid) from public;
grant execute on function public.read_public_fediverse(uuid) to rout_app;