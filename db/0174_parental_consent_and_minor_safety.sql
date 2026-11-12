-- 0174 — Minor protection: birth date, parental consent, parent-gated payments
-- and anti-bullying Q&A levels. Supersedes the 0161 "no birth date" decision at
-- the owner's explicit request. Idempotent.
--
-- is_minor is kept by a trigger whenever date_of_birth changes; because age
-- moves with time, decisions that matter call rout_user_is_minor() which
-- evaluates against current_date.
-- parent_authorizations.token stores the SHA-256 hex of the emailed token,
-- never the token itself; rout_app can only reach it through the
-- security-definer functions below.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'parent_consent_status') then
    create type public.parent_consent_status as enum ('none', 'pending', 'approved');
  end if;
  if not exists (select 1 from pg_type where typname = 'qa_permission_level') then
    create type public.qa_permission_level as enum ('disabled', 'verified_only', 'members_only', 'public_unrestricted');
  end if;
  if not exists (select 1 from pg_type where typname = 'parent_action_type') then
    create type public.parent_action_type as enum ('consent', 'payment');
  end if;
  if not exists (select 1 from pg_type where typname = 'parent_authorization_status') then
    create type public.parent_authorization_status as enum ('pending', 'approved', 'expired');
  end if;
end $$;

alter table public.users add column if not exists date_of_birth date;
alter table public.users add column if not exists is_minor boolean not null default false;
alter table public.users add column if not exists parent_email text;
alter table public.users add column if not exists parent_consent_status public.parent_consent_status not null default 'none';
alter table public.users add column if not exists qa_permission_level public.qa_permission_level not null default 'public_unrestricted';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_date_of_birth_range') then
    alter table public.users add constraint users_date_of_birth_range
      check (date_of_birth is null or (date_of_birth > date '1900-01-01' and date_of_birth <= current_date));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_parent_email_format') then
    alter table public.users add constraint users_parent_email_format
      check (parent_email is null or parent_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');
  end if;
end $$;

create or replace function public.rout_users_minor_sync()
returns trigger language plpgsql set search_path = public as $$
begin
  new.is_minor := new.date_of_birth is not null and new.date_of_birth > (current_date - interval '16 years');
  if new.is_minor and (tg_op = 'INSERT' or old.date_of_birth is distinct from new.date_of_birth) then
    new.qa_permission_level := 'verified_only';
  end if;
  return new;
end $$;
drop trigger if exists rout_users_minor_sync on public.users;
create trigger rout_users_minor_sync before insert or update of date_of_birth on public.users
  for each row execute function public.rout_users_minor_sync();

create table if not exists public.parent_authorizations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  token           text not null,
  action_type     public.parent_action_type not null,
  product_details jsonb not null default '{}'::jsonb,
  expires_at      timestamptz not null,
  status          public.parent_authorization_status not null default 'pending',
  created_at      timestamptz not null default now(),
  constraint parent_authorizations_token_hex check (token ~ '^[0-9a-f]{64}$')
);
create unique index if not exists parent_authorizations_token on public.parent_authorizations (token);
create index if not exists parent_authorizations_user on public.parent_authorizations (user_id);

revoke all on public.parent_authorizations from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.parent_authorizations from rout_app;
    grant select on public.parent_authorizations to rout_app;
  end if;
end $$;
alter table public.parent_authorizations enable row level security;
drop policy if exists rout_owner_read on public.parent_authorizations;
create policy rout_owner_read on public.parent_authorizations
  for select using (user_id = public.rout_current_user_id());

-- Live minor check (age moves with time).
create or replace function public.rout_user_is_minor(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select u.date_of_birth > (current_date - interval '16 years') from public.users u where u.id = p_user_id), false)
$$;

-- Sign-up: records age once, within 15 minutes of account creation, and opens
-- a consent authorization for a minor. Returns the user id or null.
create or replace function public.rout_record_signup_age(p_email text, p_dob date, p_parent_email text, p_token_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_minor boolean;
begin
  select id into v_id from public.users
   where lower(email) = lower(p_email) and date_of_birth is null and created_at > now() - interval '15 minutes'
   limit 1;
  if v_id is null then return null; end if;
  v_minor := p_dob > (current_date - interval '16 years');
  update public.users
     set date_of_birth = p_dob,
         parent_email = case when v_minor then lower(p_parent_email) else null end,
         parent_consent_status = case when v_minor then 'pending'::public.parent_consent_status else 'none' end
   where id = v_id;
  if v_minor and p_token_hash is not null then
    insert into public.parent_authorizations (user_id, token, action_type, expires_at)
    values (v_id, p_token_hash, 'consent', now() + interval '30 days');
  end if;
  return v_id;
end $$;

-- Parent view by token (consent tokens double as the control link).
create or replace function public.rout_parent_lookup(p_token_hash text)
returns table(action_type public.parent_action_type, status public.parent_authorization_status, expires_at timestamptz,
              product_details jsonb, child_email text, consent public.parent_consent_status, qa_level public.qa_permission_level, child_id uuid)
language sql stable security definer set search_path = public as $$
  select a.action_type,
         case when a.status = 'pending' and a.expires_at < now() then 'expired'::public.parent_authorization_status else a.status end,
         a.expires_at, a.product_details, u.email, u.parent_consent_status, u.qa_permission_level, u.id
    from public.parent_authorizations a join public.users u on u.id = a.user_id
   where a.token = p_token_hash
   limit 1
$$;

create or replace function public.rout_parent_approve_consent(p_token_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  update public.parent_authorizations set status = 'approved'
   where token = p_token_hash and action_type = 'consent' and status = 'pending' and expires_at > now()
   returning user_id into v_user;
  if v_user is null then
    return exists (select 1 from public.parent_authorizations where token = p_token_hash and action_type = 'consent' and status = 'approved');
  end if;
  update public.users set parent_consent_status = 'approved' where id = v_user;
  return true;
end $$;

-- The control link keeps working after approval (no expiry once approved).
create or replace function public.rout_parent_set_qa_level(p_token_hash text, p_level public.qa_permission_level)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select user_id into v_user from public.parent_authorizations
   where token = p_token_hash and action_type = 'consent' and (status = 'approved' or (status = 'pending' and expires_at > now()));
  if v_user is null then return false; end if;
  update public.users set qa_permission_level = p_level where id = v_user;
  return true;
end $$;

-- A minor asks for a paid action: 48-hour authorization for the parent.
create or replace function public.rout_parent_request_payment(p_user_id uuid, p_token_hash text, p_details jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_parent text;
begin
  select parent_email into v_parent from public.users where id = p_user_id and parent_email is not null;
  if v_parent is null then return null; end if;
  insert into public.parent_authorizations (user_id, token, action_type, product_details, expires_at)
  values (p_user_id, p_token_hash, 'payment', coalesce(p_details, '{}'::jsonb), now() + interval '48 hours');
  return v_parent;
end $$;

create or replace function public.rout_parent_mark_payment(p_token_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  update public.parent_authorizations set status = 'approved'
   where token = p_token_hash and action_type = 'payment' and status = 'pending' and expires_at > now()
   returning user_id into v_user;
  return v_user;
end $$;

-- Q&A level for a public handle, without exposing the birth date.
create or replace function public.rout_profile_qa_level(p_handle text)
returns public.qa_permission_level language sql stable security definer set search_path = public as $$
  select case when u.qa_permission_level <> 'public_unrestricted' then u.qa_permission_level
              when u.date_of_birth > (current_date - interval '16 years') then 'verified_only'::public.qa_permission_level
              else u.qa_permission_level end
    from public.profiles p join public.users u on u.id = p.id
   where lower(p.username) = lower(p_handle)
   limit 1
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'rout_user_is_minor(uuid)', 'rout_record_signup_age(text, date, text, text)', 'rout_parent_lookup(text)',
    'rout_parent_approve_consent(text)', 'rout_parent_set_qa_level(text, public.qa_permission_level)',
    'rout_parent_request_payment(uuid, text, jsonb)', 'rout_parent_mark_payment(text)', 'rout_profile_qa_level(text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'rout_app') then
      execute format('grant execute on function public.%s to rout_app', f);
    end if;
  end loop;
end $$;
