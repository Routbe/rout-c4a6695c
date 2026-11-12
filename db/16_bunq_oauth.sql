-- Bunq OAuth: één actieve koppeling per gebruiker.
-- Draai dit eenmalig op de Neon/Postgres-database van ROUT.

create table if not exists public.bunq_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  access_token text not null,
  token_type text not null default 'bearer',
  scope text,
  environment text not null default 'production',
  -- bunq-user waarvoor het token geldig is (gevuld na de eerste API-call).
  bunq_user_id bigint,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, environment)
);

create index if not exists bunq_oauth_tokens_user_idx
  on public.bunq_oauth_tokens (user_id);

grant select, insert, update, delete on public.bunq_oauth_tokens to authenticated;
grant all on public.bunq_oauth_tokens to service_role;
