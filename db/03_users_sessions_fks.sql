-- Phase 1 of the full move to Neon: a canonical user table, an own session
-- layer and real foreign keys with cascade deletes across the schema.
--
-- Before this migration the schema pointed at a Supabase-style `auth.users`
-- stub that no code owned. From here on `public.users` is the single source of
-- truth for identities; `auth.users` becomes a read-only compatibility view so
-- legacy SQL functions keep resolving.

-- ---------------------------------------------------------------------------
-- 1. Canonical identity table
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  email_normalized   text generated always as (lower(email)) stored,
  password_hash      text,
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  user_metadata      jsonb not null default '{}'::jsonb,
  app_metadata       jsonb not null default '{}'::jsonb,
  is_disabled        boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists users_email_normalized_key on public.users (email_normalized);

-- Carry over anything that lived in the stub (normally empty).
insert into public.users (id, email, created_at, user_metadata, app_metadata,
                          email_confirmed_at, last_sign_in_at, updated_at)
select u.id, coalesce(u.email, u.id::text || '@placeholder.invalid'), u.created_at,
       u.raw_user_meta_data, u.raw_app_meta_data, u.email_confirmed_at,
       u.last_sign_in_at, u.updated_at
  from auth.users u
 where not exists (select 1 from public.users p where p.id = u.id)
   and to_regclass('auth.users') is not null;

-- Any profile without an identity gets one, so the FK below can be trusted.
insert into public.users (id, email, created_at)
select p.id, coalesce(nullif(p.email, ''), p.id::text || '@placeholder.invalid'), coalesce(p.created_at, now())
  from public.profiles p
 where not exists (select 1 from public.users u where u.id = p.id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. auth.users becomes a compatibility view over public.users
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists auth.users cascade;

create or replace view auth.users as
  select id,
         email,
         created_at,
         user_metadata as raw_user_meta_data,
         app_metadata  as raw_app_meta_data,
         email_confirmed_at,
         last_sign_in_at,
         updated_at
    from public.users;

-- ---------------------------------------------------------------------------
-- 3. Sessions + one-time tokens (magic link, password reset, e-mail confirm)
-- ---------------------------------------------------------------------------
create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  token_hash    text not null unique,
  user_agent    text,
  ip_hash       text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index if not exists user_sessions_user_id_idx on public.user_sessions (user_id);
create index if not exists user_sessions_expires_at_idx on public.user_sessions (expires_at);

create table if not exists public.auth_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  purpose     text not null check (purpose in ('magic_link', 'password_reset', 'email_confirm', 'email_change')),
  token_hash  text not null unique,
  payload     jsonb not null default '{}'::jsonb,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists auth_tokens_user_purpose_idx on public.auth_tokens (user_id, purpose);

-- ---------------------------------------------------------------------------
-- 4. Real foreign keys with cascade deletes
-- ---------------------------------------------------------------------------

-- Clean up orphans first so the constraints can be validated.
delete from public.user_roles            where user_id        not in (select id from public.users);
delete from public.tracked_qrs           where user_id        not in (select id from public.users);
delete from public.saved_qrs             where user_id        not in (select id from public.users);
delete from public.notifications         where user_id        not in (select id from public.users);
delete from public.custom_domains        where user_id        not in (select id from public.users);
delete from public.email_aliases         where user_id        not in (select id from public.users);
delete from public.api_keys              where user_id        not in (select id from public.users);
delete from public.security_events       where user_id        not in (select id from public.users);
delete from public.badge_events          where user_id        not in (select id from public.users);
delete from public.alias_sync_jobs       where user_id        not in (select id from public.users);
delete from public.verification_payments where user_id        not in (select id from public.users);
delete from public.user_badges           where user_id        not in (select id from public.users);
update public.admin_audit_log set admin_id       = null where admin_id       is not null and admin_id       not in (select id from public.users);
update public.admin_audit_log set target_user_id = null where target_user_id is not null and target_user_id not in (select id from public.users);
update public.profiles set moderated_by = null where moderated_by is not null and moderated_by not in (select id from public.users);
update public.profiles set referred_by  = null where referred_by  is not null and referred_by  not in (select id from public.users);

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('profiles',              'id',             'users',    'id', 'cascade'),
      ('user_roles',            'user_id',        'users',    'id', 'cascade'),
      ('tracked_qrs',           'user_id',        'users',    'id', 'cascade'),
      ('saved_qrs',             'user_id',        'users',    'id', 'cascade'),
      ('notifications',         'user_id',        'users',    'id', 'cascade'),
      ('custom_domains',        'user_id',        'users',    'id', 'cascade'),
      ('email_aliases',         'user_id',        'users',    'id', 'cascade'),
      ('api_keys',              'user_id',        'users',    'id', 'cascade'),
      ('security_events',       'user_id',        'users',    'id', 'cascade'),
      ('badge_events',          'user_id',        'users',    'id', 'cascade'),
      ('alias_sync_jobs',       'user_id',        'users',    'id', 'cascade'),
      ('verification_payments', 'user_id',        'users',    'id', 'cascade'),
      ('user_badges',           'user_id',        'users',    'id', 'cascade'),
      ('admin_audit_log',       'admin_id',       'users',    'id', 'set null'),
      ('admin_audit_log',       'target_user_id', 'users',    'id', 'set null'),
      ('profiles',              'moderated_by',   'users',    'id', 'set null'),
      ('profiles',              'referred_by',    'users',    'id', 'set null')
    ) as t(tbl, col, ref_tbl, ref_col, on_delete)
  loop
    if to_regclass('public.' || spec.tbl) is null then continue; end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = spec.tbl and column_name = spec.col
    ) then continue; end if;
    if exists (
      select 1 from pg_constraint c
       where c.conrelid = ('public.' || spec.tbl)::regclass
         and c.conname = spec.tbl || '_' || spec.col || '_fkey'
    ) then continue; end if;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.%I (%I) on delete %s',
      spec.tbl, spec.tbl || '_' || spec.col || '_fkey', spec.col, spec.ref_tbl, spec.ref_col, spec.on_delete
    );
  end loop;
end
$$;

-- Indexes on the FK columns keep the cascade deletes cheap.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('user_roles','user_id'), ('tracked_qrs','user_id'), ('saved_qrs','user_id'),
      ('notifications','user_id'), ('custom_domains','user_id'), ('email_aliases','user_id'),
      ('api_keys','user_id'), ('security_events','user_id'), ('badge_events','user_id'),
      ('alias_sync_jobs','user_id'), ('verification_payments','user_id'), ('user_badges','user_id'),
      ('admin_audit_log','admin_id'), ('admin_audit_log','target_user_id'),
      ('profiles','moderated_by'), ('profiles','referred_by'), ('links','profile_id')
    ) as t(tbl, col)
  loop
    if to_regclass('public.' || spec.tbl) is null then continue; end if;
    execute format('create index if not exists %I on public.%I (%I)',
                   spec.tbl || '_' || spec.col || '_idx', spec.tbl, spec.col);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Profile row follows the identity
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, created_at, updated_at)
  values (
    new.id,
    new.email,
    nullif(new.user_metadata ->> 'full_name', ''),
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_user_created on public.users;
create trigger on_user_created
  after insert on public.users
  for each row execute function public.handle_new_user();
