-- 22. Social links: eigendomsverificatie via bio-link + gecachte volgeraantallen.
--
-- De publieke profielpagina leest uitsluitend uit deze tabel (0 externe calls).
-- Verversen gebeurt door de cron (`/api/public/cron/sync-socials`) of handmatig
-- in de Studio, maximaal één keer per 24 uur per account.

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null,
  username text not null,
  is_verified boolean not null default false,
  follower_count integer,
  verification_code text,
  verified_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_links_platform_check check (
    platform in ('x', 'instagram', 'tiktok', 'youtube', 'github', 'mastodon', 'bluesky', 'wsocial')
  ),
  constraint social_links_unique_platform unique (profile_id, platform)
);

create index if not exists social_links_profile_idx on public.social_links (profile_id);
create index if not exists social_links_sync_idx on public.social_links (is_verified, last_synced_at);

-- 1. Rechten -----------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert, update, delete on public.social_links to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public.social_links to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on public.social_links to service_role';
  end if;
end $$;

-- 2. Row Level Security ------------------------------------------------------
-- Tolerant: de helper bestaat al vanaf migratie 21, maar niet elke omgeving
-- heeft die uitgevoerd.
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

alter table public.social_links enable row level security;

drop policy if exists social_links_public_select on public.social_links;
create policy social_links_public_select on public.social_links
  for select using (true);

drop policy if exists social_links_owner_insert on public.social_links;
create policy social_links_owner_insert on public.social_links
  for insert with check (profile_id = public.current_app_user_id());

drop policy if exists social_links_owner_update on public.social_links;
create policy social_links_owner_update on public.social_links
  for update using (profile_id = public.current_app_user_id());

drop policy if exists social_links_owner_delete on public.social_links;
create policy social_links_owner_delete on public.social_links
  for delete using (profile_id = public.current_app_user_id());

-- 3. updated_at --------------------------------------------------------------
create or replace function public.social_links_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists social_links_touch_trg on public.social_links;
create trigger social_links_touch_trg
  before update on public.social_links
  for each row execute function public.social_links_touch();
