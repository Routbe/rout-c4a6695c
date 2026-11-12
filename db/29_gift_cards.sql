-- 29 — Cadeaubonnen (gift cards).
--
-- Een cadeaubon is twee dingen tegelijk:
--   1. een order-regel hier (wie kocht, voor wie, hoe geleverd, betaalstatus);
--   2. na betaling een gewone rij in `promo_codes` met een vast bedrag en
--      één inwisseling — zo werkt de bon meteen in de bestaande checkout
--      zonder een tweede kortingsmechanisme.
--
-- De tabel blijft server-only: alleen `service_role` mag erbij, precies zoals
-- bij `promo_codes`. De publieke 3D-weergave loopt via een serverfunctie die
-- alleen veilige kolommen teruggeeft.

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount_cents integer not null check (amount_cents between 500 and 50000),
  currency text not null default 'EUR',

  -- Koper
  purchaser_user_id uuid,
  purchaser_email text not null,
  purchaser_name text,

  -- Ontvanger
  recipient_email text,
  recipient_name text,
  message text,
  design text not null default 'classic',

  -- Levering
  physical_delivery boolean not null default false,
  ship_name text,
  ship_line1 text,
  ship_postal_code text,
  ship_city text,
  ship_country text,

  -- Betaling & bezorging
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'delivered', 'cancelled')),
  stripe_reference text,
  invoice_number text,
  paid_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gift_cards_code_idx on public.gift_cards (code);
create index if not exists gift_cards_purchaser_idx on public.gift_cards (purchaser_user_id, created_at desc);
create index if not exists gift_cards_status_idx on public.gift_cards (status);

alter table public.gift_cards enable row level security;

-- Geen client-facing policies: enkel de serverfuncties (service_role) mogen
-- lezen of schrijven, zodat niemand codes kan opsommen of zelf kan aanmaken.
grant select, insert, update, delete on public.gift_cards to service_role;

drop policy if exists "Service role manages gift cards" on public.gift_cards;
create policy "Service role manages gift cards" on public.gift_cards
  for all to service_role
  using (true)
  with check (true);
