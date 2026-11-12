-- 96 — Workspaces & RBAC: people always sign in personally; companies are workspaces with members.
do $$ begin
  create type public.workspace_role as enum ('owner', 'admin', 'developer', 'editor');
exception when duplicate_object then null; end $$;

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  avatar_url  text,
  plan        text not null default 'free' check (plan in ('free', 'pro', 'business')),
  created_at  timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  role         public.workspace_role not null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,
  role         public.workspace_role not null,
  invited_by   uuid not null references public.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at   timestamptz not null default now()
);
create unique index if not exists workspace_invites_open_idx
  on public.workspace_invites (workspace_id, lower(email)) where status = 'pending';
create index if not exists workspace_invites_email_idx on public.workspace_invites (lower(email)) where status = 'pending';

alter table if exists public.oauth_clients add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

grant select, insert, update, delete on public.workspaces, public.workspace_members, public.workspace_invites to rout_app;

-- Backfill: every approved business profile becomes a workspace owned by its user.
insert into public.workspaces (name, slug)
select coalesce(nullif(p.business_name, ''), p.username), 'ws-' || lower(regexp_replace(p.username, '[^a-zA-Z0-9-]', '', 'g'))
from public.profiles p
where p.is_business = true and p.username is not null
  and char_length(regexp_replace(p.username, '[^a-zA-Z0-9-]', '', 'g')) between 1 and 35
on conflict (slug) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, p.id, 'owner'
from public.profiles p
join public.workspaces w on w.slug = 'ws-' || lower(regexp_replace(p.username, '[^a-zA-Z0-9-]', '', 'g'))
where p.is_business = true and p.id is not null
  and exists (select 1 from public.users u where u.id = p.id)
on conflict do nothing;
