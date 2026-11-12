-- 25 — Stripe Connect payout state for creators (used by the account.updated webhook).

alter table public.profiles
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_status text not null default 'none',
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false;

alter table public.profiles drop constraint if exists profiles_stripe_account_status_check;
alter table public.profiles
  add constraint profiles_stripe_account_status_check
  check (stripe_account_status in ('none', 'pending', 'active', 'restricted'));

create unique index if not exists profiles_stripe_account_id_key
  on public.profiles (stripe_account_id)
  where stripe_account_id is not null;
