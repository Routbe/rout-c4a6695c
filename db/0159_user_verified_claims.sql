-- 0159: verifiable claims — the foundation for ROUT as a sovereign trust provider.
-- Only yes/no outcomes are stored, never a birth date, ID document or document number.
-- Members can read their own claims; nobody can write them through the app runtime:
-- a claim may only be set by a future, reviewed verification path (itsme / eIDAS),
-- so a member can never self-assert "18+" or "verified human".
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'claim_verification_provider') then
    create type public.claim_verification_provider as enum ('none', 'itsme', 'eidas');
  end if;
end $$;

create table if not exists public.user_verified_claims (
  user_id uuid primary key references public.users (id) on delete cascade,
  is_verified_human boolean not null default false,
  is_over_18 boolean not null default false,
  verification_provider public.claim_verification_provider not null default 'none',
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  -- A positive claim always names who verified it and when.
  constraint user_verified_claims_proven check (
    (not is_verified_human and not is_over_18)
    or (verification_provider <> 'none' and verified_at is not null)
  )
);

-- Least privilege: the runtime may only read; RLS limits reads to the member's own row.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.user_verified_claims from rout_app;
    grant select on public.user_verified_claims to rout_app;
  end if;
end $$;
revoke all on public.user_verified_claims from public;

alter table public.user_verified_claims enable row level security;
drop policy if exists rout_owner_read on public.user_verified_claims;
create policy rout_owner_read on public.user_verified_claims
  for select using (user_id = public.rout_current_user_id());
