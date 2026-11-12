-- 84 — E-mail security codes (merge, password, 2FA) and saved profile designs.
create table if not exists public.security_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  purpose text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists security_codes_user_purpose_idx on public.security_codes (user_id, purpose, created_at desc);

create table if not exists public.profile_design_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profile_design_templates_user_idx on public.profile_design_templates (user_id, created_at desc);

alter table public.account_merge_tickets add column if not exists preview_user_id uuid;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.security_codes, public.profile_design_templates to rout_app;
  end if;
end $$;
