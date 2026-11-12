-- 30 — Fysieke levering van cadeaubonnen (enkel België, gratis verzending).
--
-- De betaalstatus (`gift_cards.status`) zegt niets over het drukwerk. Een
-- betaalde fysieke bon doorloopt een eigen ketting: pending_print → packaged →
-- shipped, met een optionele trackingcode. Digitale bonnen blijven op
-- 'not_applicable' staan zodat de adminwachtrij ze niet toont.

alter table public.gift_cards
  add column if not exists fulfilment_status text not null default 'not_applicable'
    check (fulfilment_status in ('not_applicable', 'pending_print', 'packaged', 'shipped')),
  add column if not exists tracking_code text,
  add column if not exists packaged_at timestamptz,
  add column if not exists shipped_at timestamptz;

-- Bestaande betaalde fysieke bonnen komen meteen in de drukwachtrij.
update public.gift_cards
   set fulfilment_status = 'pending_print'
 where physical_delivery = true
   and fulfilment_status = 'not_applicable'
   and status in ('paid', 'delivered');

create index if not exists gift_cards_fulfilment_idx
  on public.gift_cards (fulfilment_status, created_at desc)
  where physical_delivery = true;
