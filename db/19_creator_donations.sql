-- 19. Donaties aan geverifieerde makers (`rout.be/u/<handle>/donate`).
--
-- Eén rij per steunactie. De rij wordt aangemaakt vóór de Stripe-checkout en
-- pas op 'paid' gezet door de webhook, zodat een afgebroken betaling nooit als
-- steun telt.

create table if not exists public.creator_donations (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null references public.profiles(id) on delete cascade,
  handle         text not null,
  amount_cents   integer not null check (amount_cents >= 100 and amount_cents <= 500000),
  currency       text not null default 'eur',
  message        text,
  supporter_name text,
  supporter_email text,
  provider       text not null default 'stripe',
  session_id     text,
  status         text not null default 'pending',
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);

create index if not exists creator_donations_creator_idx
  on public.creator_donations (creator_id, created_at desc);
create index if not exists creator_donations_session_idx
  on public.creator_donations (session_id);
