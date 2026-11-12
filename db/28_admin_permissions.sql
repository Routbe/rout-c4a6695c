-- 28 — Granular admin permissions, manual legal names and per-user feature blocks.
--
-- `admin_permissions` lets the owner delegate a single capability (for example
-- "verify users") without handing out the full admin role. Holding the `admin`
-- role in `user_roles` still implies every permission.

create table if not exists public.admin_permissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  permission  text not null,
  granted_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, permission)
);

create index if not exists admin_permissions_user_idx on public.admin_permissions (user_id);

grant select on public.admin_permissions to authenticated;
grant all on public.admin_permissions to service_role;

alter table public.admin_permissions enable row level security;

drop policy if exists "admin_permissions self read" on public.admin_permissions;
create policy "admin_permissions self read"
  on public.admin_permissions for select
  to authenticated
  using (user_id = auth.uid());

-- Temporary or permanent blocks on a single user capability.
create table if not exists public.user_feature_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  feature     text not null,
  reason      text,
  until       timestamptz,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, feature)
);

create index if not exists user_feature_blocks_user_idx on public.user_feature_blocks (user_id);

grant select on public.user_feature_blocks to authenticated;
grant all on public.user_feature_blocks to service_role;

alter table public.user_feature_blocks enable row level security;

drop policy if exists "feature blocks self read" on public.user_feature_blocks;
create policy "feature blocks self read"
  on public.user_feature_blocks for select
  to authenticated
  using (user_id = auth.uid());

-- Split legal name so an admin can fill in / correct first and last name and
-- derive the verified handle (voornaam.achternaam) from it.
alter table public.profiles
  add column if not exists legal_first_name text,
  add column if not exists legal_last_name  text;
