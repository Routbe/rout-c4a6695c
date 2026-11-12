-- 0141: "Login met ROUT" step-up proofs are bound to one authorization request.
-- Codes created before this migration carry no request_id and can no longer be
-- verified or consumed (they were valid for at most 10 minutes anyway).
alter table public.oauth_step_up_codes add column if not exists request_id text;
alter table public.oauth_step_up_codes add column if not exists method text not null default 'email';
alter table public.oauth_step_up_codes drop constraint if exists oauth_step_up_codes_method_check;
alter table public.oauth_step_up_codes add constraint oauth_step_up_codes_method_check
  check (method in ('email', 'passkey'));
create index if not exists oauth_step_up_codes_request_idx
  on public.oauth_step_up_codes (user_id, client_id, request_id) where consumed_at is null;

-- Single-use WebAuthn challenges for passkey step-up, one per authorization request.
create table if not exists public.oauth_step_up_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  client_id text not null,
  request_id text not null,
  challenge text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oauth_step_up_challenges_user_idx
  on public.oauth_step_up_challenges (user_id, client_id, request_id) where consumed_at is null;
alter table public.oauth_step_up_challenges enable row level security;
revoke all on public.oauth_step_up_challenges from public;
grant select, insert, update, delete on public.oauth_step_up_challenges to rout_app;
