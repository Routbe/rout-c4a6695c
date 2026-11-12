-- 103 — Personal-to-Workspace conversion: double opt-in transfers, atomic move, 30-day sunset.

create or replace function public.wt_assert(ok boolean, msg text) returns boolean
language plpgsql as $$
begin
  if not coalesce(ok, false) then
    raise exception '%', msg using errcode = 'P0001';
  end if;
  return true;
end $$;

create table if not exists public.workspace_transfers (
  id              uuid primary key default gen_random_uuid(),
  source_user_id  uuid not null references public.users(id) on delete cascade,
  target_user_id  uuid references public.users(id) on delete set null,
  target_email    text not null,
  workspace_name  text not null check (char_length(workspace_name) between 1 and 80),
  token_hash      text not null unique,
  otp_verified_at timestamptz,
  accepted_at     timestamptz,
  status          text not null default 'pending'
                  check (status in ('pending', 'otp_ok', 'accepted', 'completed', 'cancelled', 'expired')),
  workspace_id    uuid references public.workspaces(id) on delete set null,
  completed_at    timestamptz,
  expires_at      timestamptz not null default now() + interval '7 days',
  created_at      timestamptz not null default now()
);
create unique index if not exists workspace_transfers_open_idx
  on public.workspace_transfers (source_user_id) where status in ('pending', 'otp_ok', 'accepted');
create index if not exists workspace_transfers_email_idx
  on public.workspace_transfers (lower(target_email)) where status in ('pending', 'otp_ok');

alter table public.workspaces add column if not exists stripe_customer_id text;
alter table public.workspaces add column if not exists billing_name text;
alter table public.workspaces add column if not exists vat_number text;
alter table public.workspaces add column if not exists legacy_user_id uuid references public.users(id) on delete set null;

alter table public.profiles add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.tracked_qrs add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
create index if not exists profiles_workspace_idx on public.profiles (workspace_id) where workspace_id is not null;
create index if not exists tracked_qrs_workspace_idx on public.tracked_qrs (workspace_id) where workspace_id is not null;

alter table public.users add column if not exists account_status text not null default 'active';
alter table public.users drop constraint if exists users_account_status_check;
alter table public.users add constraint users_account_status_check
  check (account_status in ('active', 'migrated_sunset', 'retired'));
alter table public.users add column if not exists sunset_at timestamptz;
alter table public.users add column if not exists migrated_to_workspace_id uuid references public.workspaces(id) on delete set null;
create index if not exists users_sunset_idx on public.users (sunset_at) where account_status = 'migrated_sunset';

grant select, insert, update, delete on public.workspace_transfers to rout_app;
grant execute on function public.wt_assert(boolean, text) to rout_app;
