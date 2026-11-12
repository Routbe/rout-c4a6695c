-- 0195: platform-wide feature switches for the admin portal.
-- Missing rows mean "on". Reads are open to the runtime role (no personal
-- data); writes require an admin row in user_roles for rout.current_user_id.
create table if not exists public.platform_feature_switches (
  feature text primary key check (feature ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled boolean not null default true,
  note text check (note is null or char_length(note) <= 300),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.platform_feature_switches to rout_app;
alter table public.platform_feature_switches enable row level security;

drop policy if exists platform_features_read on public.platform_feature_switches;
create policy platform_features_read on public.platform_feature_switches
  for select to rout_app using (true);
drop policy if exists platform_features_admin_insert on public.platform_feature_switches;
create policy platform_features_admin_insert on public.platform_feature_switches
  for insert to rout_app with check (exists (
    select 1 from public.user_roles r where r.user_id = public.rout_current_user_id() and r.role::text = 'admin'));
drop policy if exists platform_features_admin_update on public.platform_feature_switches;
create policy platform_features_admin_update on public.platform_feature_switches
  for update to rout_app using (exists (
    select 1 from public.user_roles r where r.user_id = public.rout_current_user_id() and r.role::text = 'admin'))
  with check (exists (
    select 1 from public.user_roles r where r.user_id = public.rout_current_user_id() and r.role::text = 'admin'));
