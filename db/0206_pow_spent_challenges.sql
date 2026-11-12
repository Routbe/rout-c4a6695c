-- 0206 — Single-use proof-of-work challenges for heavy agent operations.
-- Challenges are stateless and HMAC-signed; this table only remembers the
-- SHA-256 of challenges already spent so one solution cannot be replayed.
-- Rows expire with the challenge (10 min) and are purged opportunistically.
-- Idempotent; run as owner.

create table if not exists public.pow_spent_challenges (
  challenge_hash text primary key check (challenge_hash ~ '^[0-9a-f]{64}$'),
  scope          text not null check (scope ~ '^[a-z_]{1,32}$'),
  expires_at     timestamptz not null
);
create index if not exists pow_spent_challenges_expires_idx on public.pow_spent_challenges (expires_at);
revoke all on public.pow_spent_challenges from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.pow_spent_challenges from rout_app;
  end if;
end $$;
alter table public.pow_spent_challenges enable row level security;

-- true = first use (accepted), false = replay.
create or replace function public.rout_pow_spend(p_hash text, p_scope text, p_expires_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inserted int;
begin
  delete from public.pow_spent_challenges where expires_at < now() - interval '1 minute';
  insert into public.pow_spent_challenges (challenge_hash, scope, expires_at)
  values (p_hash, p_scope, least(p_expires_at, now() + interval '15 minutes'))
  on conflict (challenge_hash) do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end $$;
revoke all on function public.rout_pow_spend(text, text, timestamptz) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_pow_spend(text, text, timestamptz) to rout_app;
  end if;
end $$;
