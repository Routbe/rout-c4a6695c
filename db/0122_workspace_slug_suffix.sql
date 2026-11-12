-- Namespace matrix enforced in the database: free workspaces always carry a
-- 4-char suffix (name-xxxx); clean slugs and root aliases (rout.be/<naam>)
-- require plan plus/pro/business or an Early Verified owner.

create or replace function public.workspace_may_drop_suffix(ws_plan text, ws uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select coalesce(ws_plan, 'free') in ('plus', 'pro', 'business')
      or exists (select 1 from public.entitlement_overrides o
                  where o.scope_type = 'workspace' and o.scope_id = ws
                    and o.entitlement_key = 'WORKSPACE_PLAN' and o.value in ('plus', 'pro', 'business'))
      or exists (select 1 from public.workspace_members m
                   join public.entitlement_overrides o
                     on o.scope_type = 'user' and o.scope_id = m.user_id
                    and o.entitlement_key = 'PRO_FOR_LIFE' and o.value = 'true'
                  where m.workspace_id = ws and m.role = 'owner')
  $$;
revoke all on function public.workspace_may_drop_suffix(text, uuid) from public;

create or replace function public.enforce_workspace_slug_suffix() returns trigger
  language plpgsql set search_path = public
  as $$
  begin
    new.slug := lower(new.slug);
    if new.slug !~ '-[a-z0-9]{4}$' and not public.workspace_may_drop_suffix(new.plan, new.id) then
      new.slug := left(new.slug, 35) || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    end if;
    return new;
  end
  $$;

drop trigger if exists workspaces_slug_suffix on public.workspaces;
create trigger workspaces_slug_suffix before insert or update of slug, plan on public.workspaces
  for each row execute function public.enforce_workspace_slug_suffix();

-- Root alias rout.be/<handle> pointing to a workspace. One per workspace, shared namespace with handles.
create table public.workspace_root_aliases (
  handle text primary key check (handle = lower(handle) and handle ~ '^[a-z0-9-]{3,40}$'),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.enforce_workspace_root_alias() returns trigger
  language plpgsql set search_path = public
  as $$
  declare ws_plan text;
  begin
    select plan into ws_plan from public.workspaces where id = new.workspace_id;
    if not public.workspace_may_drop_suffix(ws_plan, new.workspace_id) then
      raise exception 'workspace_root_alias_requires_plan' using errcode = '42501';
    end if;
    if exists (select 1 from public.profiles p
                where lower(p.username) = new.handle or lower(coalesce(p.subdomain_alias, '')) = new.handle)
       or exists (select 1 from public.alias_profiles a where lower(a.handle) = new.handle) then
      raise exception 'workspace_root_alias_taken' using errcode = '23505';
    end if;
    return new;
  end
  $$;

create trigger workspace_root_aliases_rules before insert or update on public.workspace_root_aliases
  for each row execute function public.enforce_workspace_root_alias();

grant select, insert, update, delete on public.workspace_root_aliases to rout_app;
alter table public.workspace_root_aliases enable row level security;
create policy rout_scope on public.workspace_root_aliases to rout_app
  using (public.rout_is_workspace_member(workspace_id))
  with check (public.rout_is_workspace_member(workspace_id));

-- Public lookup for rout.be/<handle> → workspace slug, without opening the table to visitors.
create or replace function public.workspace_slug_for_root_alias(h text) returns text
  language sql stable security definer set search_path = public
  as $$ select w.slug from public.workspace_root_aliases a join public.workspaces w on w.id = a.workspace_id
         where a.handle = lower(h) limit 1 $$;
revoke all on function public.workspace_slug_for_root_alias(text) from public;
grant execute on function public.workspace_slug_for_root_alias(text) to rout_app;
