-- Developer Console: publishing, contact, security settings per OAuth client. Idempotent.
alter table if exists public.oauth_clients add column if not exists publishing_status text not null default 'testing';
alter table if exists public.oauth_clients add column if not exists support_email text;
alter table if exists public.oauth_clients add column if not exists legal_owner text;
alter table if exists public.oauth_clients add column if not exists dpo_email text;
alter table if exists public.oauth_clients add column if not exists require_pkce boolean not null default true;
alter table if exists public.oauth_clients add column if not exists access_token_ttl integer not null default 3600;
alter table if exists public.oauth_clients add column if not exists allowed_ips text[] not null default '{}';
alter table if exists public.oauth_clients add column if not exists account_discovery_enabled boolean not null default false;

create table if not exists public.oauth_client_test_users (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  identifier text not null,
  created_at timestamptz not null default now(),
  unique (client_id, identifier)
);

create table if not exists public.oauth_client_verification_requests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  requested_by uuid not null,
  status text not null default 'pending',
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oauth_client_verification_requests_client_idx
  on public.oauth_client_verification_requests (client_id, created_at desc);
