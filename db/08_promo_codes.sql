-- Promocodes voor de Early Believer-checkout (idempotent).
--
-- De code zelf blijft server-only: alleen `service_role` mag de tabel lezen.
-- Validatie gebeurt via de `validatePromoCode`-serverfunctie, nooit rechtstreeks
-- vanuit de client.

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text,
  percent_off integer not null default 0 check (percent_off between 0 and 100),
  amount_off_cents integer not null default 0 check (amount_off_cents >= 0),
  max_redemptions integer,
  redeemed_count integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promo_codes_code_idx on public.promo_codes (code);

alter table public.promo_codes enable row level security;

-- No client-facing policies: only service_role (server functions) may touch
-- this table, so an authenticated user can never enumerate or self-grant codes.
grant select, insert, update, delete on public.promo_codes to service_role;

drop policy if exists "Service role manages promo codes" on public.promo_codes;
create policy "Service role manages promo codes" on public.promo_codes
  for all to service_role
  using (true)
  with check (true);

insert into public.promo_codes (code, label, percent_off, amount_off_cents)
select 'EARLYBELIEVER', '100% korting', 100, 0
where not exists (select 1 from public.promo_codes where code = 'EARLYBELIEVER');
