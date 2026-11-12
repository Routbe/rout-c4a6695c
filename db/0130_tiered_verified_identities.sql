-- Tiered identity: one verified human per account (Sybil-resistant nullifier).
-- Root redirect columns already live on public.custom_domains (db/0128).
create table if not exists public.verified_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  identity_nullifier text not null unique,
  provider text not null check (provider in ('didit', 'w_identity', 'itsme', 'eid')),
  tier text not null default 'tier_1_real_human'
    check (tier in ('tier_1_real_human', 'tier_2_legal_identity')),
  method_details jsonb not null default '{}'::jsonb,
  verified_at timestamptz not null default now()
);

alter table public.verified_identities enable row level security;
drop policy if exists rout_scope on public.verified_identities;
create policy rout_scope on public.verified_identities
  for select using (user_id = public.rout_current_user_id());

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update on public.verified_identities to rout_app;
  end if;
end $$;
