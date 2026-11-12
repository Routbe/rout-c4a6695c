-- 69. EARLYBELIEVER (100% korting) krijgt een gebruikslimiet in plaats van een
-- onbeperkte ingebakken code. Idempotent; een bestaande limiet blijft staan.
insert into public.promo_codes (code, label, percent_off, max_redemptions)
values ('EARLYBELIEVER', '100% korting', 100, 100)
on conflict (code) do update
  set max_redemptions = coalesce(public.promo_codes.max_redemptions, 100),
      updated_at = now();
