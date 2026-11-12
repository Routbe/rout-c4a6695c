-- Scoped events; visitors read only through a narrow function that enforces profile visibility.
create table public.profile_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text not null default '' check (char_length(venue) <= 200),
  description text not null default '' check (char_length(description) <= 2000),
  ticket_url text not null default '' check (char_length(ticket_url) <= 500 and (ticket_url = '' or ticket_url ~ '^https://')),
  published boolean not null default true,
  slug text not null unique default gen_random_uuid()::text,
  profile_space text not null check (profile_space in ('root','alias','workspace')),
  profile_handle text not null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check ((profile_space = 'workspace') = (workspace_id is not null))
);
create index profile_events_scope_idx on public.profile_events(workspace_id, user_id, starts_at);
create index profile_events_binding_idx on public.profile_events(profile_space, profile_handle, starts_at);
alter table public.profile_events enable row level security;
create policy rout_scope on public.profile_events using (
  (workspace_id is null and user_id = public.rout_current_user_id()) or
  (workspace_id is not null and public.rout_is_workspace_member(workspace_id))
) with check (
  (workspace_id is null and user_id = public.rout_current_user_id()) or
  (workspace_id is not null and public.rout_is_workspace_member(workspace_id))
);

create function public.profile_event_is_public(e public.profile_events) returns boolean
language sql stable security definer set search_path = public as $$
  select e.published and case e.profile_space
    when 'alias' then exists (
      select 1 from public.alias_profiles a join public.profiles p on p.id = a.user_id
      where a.user_id = e.user_id and a.handle = e.profile_handle and a.enabled
        and coalesce((a.display_prefs->>'publicProfile')::boolean, true)
        and not coalesce(p.is_banned,false) and not coalesce(p.is_suspended,false)
        and coalesce(p.status,'active') not in ('frozen','banned','suspended'))
    when 'root' then exists (
      select 1 from public.profiles p where p.id = e.user_id and p.username = e.profile_handle
        and p.workspace_id is null and coalesce((p.display_prefs->>'publicProfile')::boolean,true)
        and not coalesce(p.is_banned,false) and not coalesce(p.is_suspended,false)
        and coalesce(p.status,'active') not in ('frozen','banned','suspended'))
    when 'workspace' then exists (
      select 1 from public.workspaces w join public.profiles p on p.workspace_id = w.id
      where w.id = e.workspace_id and w.slug = e.profile_handle
        and coalesce((p.display_prefs->>'publicProfile')::boolean,true)
        and not coalesce(p.is_banned,false) and not coalesce(p.is_suspended,false)
        and coalesce(p.status,'active') not in ('frozen','banned','suspended'))
    else false end
$$;
revoke all on function public.profile_event_is_public(public.profile_events) from public;

-- By slug: the single event (also after it ended). By profile: upcoming only.
create function public.read_public_events(p_slug text, p_space text, p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,'venue',e.venue,
    'description',e.description,'ticketUrl',e.ticket_url,'slug',e.slug,
    'profileSpace',e.profile_space,'profileHandle',e.profile_handle) order by e.starts_at),'[]'::jsonb)
  from (
    select * from public.profile_events e
    where public.profile_event_is_public(e)
      and (case when p_slug is not null then e.slug = p_slug
           else e.profile_space = p_space and e.profile_handle = p_handle
             and coalesce(e.ends_at, e.starts_at + interval '4 hours') >= now() end)
    order by e.starts_at limit 50
  ) e
$$;
revoke all on function public.read_public_events(text,text,text) from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='rout_app') then
    grant select, insert, update, delete on public.profile_events to rout_app;
    grant execute on function public.read_public_events(text,text,text) to rout_app;
  end if;
end $$;
