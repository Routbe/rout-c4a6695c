-- 20. ROUT SecureShield™ prepaid wallet.
--
-- Eén saldo per gebruiker plus een onveranderlijk grootboek. Het saldo dekt de
-- maandelijkse relaykost (€0,09) van actieve mailrelays; opwaarderen gebeurt via
-- Stripe met een minimum van €3,00 zodat de gatewaykosten gedekt blijven.

create table if not exists public.wallets (
  user_id uuid primary key references public.users(id) on delete cascade,
  balance_cents integer not null default 0,
  auto_topup boolean not null default false,
  auto_topup_cents integer not null default 500,
  last_charged_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('topup', 'relay_fee', 'refund', 'adjustment')),
  amount_cents integer not null,
  description text,
  reference text,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create index if not exists wallet_transactions_user_idx
  on public.wallet_transactions (user_id, created_at desc);

create unique index if not exists wallet_transactions_reference_idx
  on public.wallet_transactions (reference) where reference is not null;

comment on table public.wallets is
  'SecureShield prepaid saldo per gebruiker (in eurocent).';
