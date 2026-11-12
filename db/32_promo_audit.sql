-- 32 — Auditspoor voor promocodes.
--
-- `promo_codes.redeemed_count` zegt alleen *hoe vaak*; deze tabel zegt *wanneer*
-- en *waarvoor*. Elke aanmaak, verzending (e-mail/SMS) en inwisseling komt hier
-- terecht, zodat support kan zien of een code al gebruikt is.

create table if not exists public.promo_code_events (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  event text not null check (event in ('created', 'sent_email', 'sent_sms', 'redeemed', 'exhausted')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists promo_code_events_code_idx
  on public.promo_code_events (code, created_at desc);

alter table public.promo_code_events enable row level security;

grant select, insert on public.promo_code_events to service_role;

drop policy if exists "Service role manages promo events" on public.promo_code_events;
create policy "Service role manages promo events" on public.promo_code_events
  for all to service_role
  using (true)
  with check (true);

-- Laatste inwisseling direct zichtbaar in de adminlijst.
alter table public.promo_codes
  add column if not exists last_redeemed_at timestamptz;
