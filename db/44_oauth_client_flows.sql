-- 44 — "Login met ROUT": flowkeuze, Rich Identity en step-up codes (idempotent).
-- Raakt uitsluitend de OIDC-provider tabellen, nooit de rout.be-login zelf.
alter table if exists public.oauth_clients add column if not exists flow_preference text not null default 'seamless';
alter table if exists public.oauth_clients add column if not exists rich_identity_enabled boolean not null default false;
alter table if exists public.oauth_auth_codes add column if not exists acr text;
alter table if exists public.oauth_auth_codes add column if not exists rich_identity boolean not null default false;
create table if not exists public.oauth_step_up_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oauth_step_up_codes_lookup on public.oauth_step_up_codes (user_id, client_id, created_at desc);
