-- Maximale korting in euro bij een procentuele promocode (bijv. 50% met een
-- plafond van €10). `null` = geen plafond.
alter table public.promo_codes
  add column if not exists max_discount_cents integer;

alter table public.promo_codes
  drop constraint if exists promo_codes_max_discount_cents_check;
alter table public.promo_codes
  add constraint promo_codes_max_discount_cents_check
  check (max_discount_cents is null or max_discount_cents >= 0);
