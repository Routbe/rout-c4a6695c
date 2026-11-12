-- Hybride identiteitsverificatie (W Identity OIDC / Didit paspoortscan / manueel).
-- 1 geverifieerd account per fysieke persoon via unique_human_id (gepeperde HMAC, nooit de ruwe ID).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'identity_provider') then
    create type public.identity_provider as enum ('w_identity', 'didit', 'manual');
  end if;
end $$;

create table if not exists public.identity_verifications (
  user_id uuid primary key references public.users(id) on delete cascade,
  is_verified boolean not null default false,
  verified_real_name text,
  verification_provider public.identity_provider,
  unique_human_id text unique,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Eens geverifieerd zijn naam, menselijke ID en provider onwijzigbaar voor de app-rol.
create or replace function public.identity_verifications_immutable() returns trigger
language plpgsql as $$
begin
  if old.is_verified and current_user = 'rout_app' and (
       new.is_verified is distinct from old.is_verified
    or new.verified_real_name is distinct from old.verified_real_name
    or new.unique_human_id is distinct from old.unique_human_id
    or new.verification_provider is distinct from old.verification_provider) then
    raise exception 'identity_immutable' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_identity_verifications_immutable on public.identity_verifications;
create trigger trg_identity_verifications_immutable
  before update on public.identity_verifications
  for each row execute function public.identity_verifications_immutable();

-- Kortlevende start-sessies (OIDC state / Didit vendor_data).
create table if not exists public.identity_verification_sessions (
  state text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  provider public.identity_provider not null,
  code_verifier text,
  expires_at timestamptz not null
);

-- Maandteller geslaagde Didit-verificaties (limiet 500).
create table if not exists public.didit_monthly_usage (
  month date primary key,
  success_count integer not null default 0
);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update on public.identity_verifications to rout_app;
    grant select, insert, update, delete on public.identity_verification_sessions to rout_app;
    grant select, insert, update on public.didit_monthly_usage to rout_app;
  end if;
end $$;
