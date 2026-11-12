-- Dynamisch prijsbeheer voor de checkout (beheerd via /admin → Prijzen).
-- Eén rij (id = 1); alle bedragen in centen.

create table if not exists public.pricing_settings (
  id int primary key default 1,
  verification_base_cents int not null default 399,
  fee_card_cents int not null default 999,
  fee_bunq_cents int not null default 499,
  fee_sepa_cents int not null default 0,
  min_donation_cents int not null default 100,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint pricing_settings_single_row check (id = 1),
  constraint pricing_settings_non_negative check (
    verification_base_cents >= 0
    and fee_card_cents >= 0
    and fee_bunq_cents >= 0
    and fee_sepa_cents >= 0
    and min_donation_cents >= 1
  )
);

insert into public.pricing_settings (id) values (1) on conflict (id) do nothing;
