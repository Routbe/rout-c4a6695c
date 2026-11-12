-- Account freeze, linked identities and the sovereign account-merge flow.

-- 1. Linked OAuth identities (one row per provider account, multiple Google
--    accounts per member are allowed).
create table if not exists public.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  email text,
  avatar_url text,
  display_name text,
  created_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);

create index if not exists user_identities_user_id_idx on public.user_identities (user_id);

-- 2. One-time merge tickets: the primary account issues them, the secondary
--    account redeems them. Only digests are stored.
create table if not exists public.account_merge_tickets (
  id uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null references public.users(id) on delete cascade,
  pin_hash text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  secondary_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists account_merge_tickets_primary_idx
  on public.account_merge_tickets (primary_user_id);

-- 3. `profiles.status` already exists; 'frozen' is simply a new value.
comment on column public.profiles.status is
  'active | frozen (self-paused) | suspended | banned';
