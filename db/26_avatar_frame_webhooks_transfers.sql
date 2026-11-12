-- 26 — Avatarkader-standaard, idempotente webhooks en de betaaltermijn van
--      overschrijvingen.

-- 1. Avatarkader ------------------------------------------------------------
-- `display_prefs.avatarFrame` is nieuw. Bestaande profielen krijgen expliciet
-- 'none', zodat de studio en de publieke weergave nooit op `undefined` vallen.
update public.profiles
   set display_prefs = coalesce(display_prefs, '{}'::jsonb) || '{"avatarFrame":"none"}'::jsonb
 where display_prefs is null
    or not (display_prefs ? 'avatarFrame');

-- 2. Idempotente webhookverwerking ----------------------------------------
-- Eén rij per Stripe-event-id. `status` onderscheidt een geclaimd event dat nog
-- loopt van een afgerond of gefaald event, zodat een crash halverwege niet als
-- "al verwerkt" wordt weggezet en Stripe's retry hem alsnog afmaakt.
create table if not exists public.webhook_events (
  id text primary key,
  source text not null default 'stripe',
  kind text,
  status text not null default 'processing',
  attempts integer not null default 1,
  result text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.webhook_events
  add column if not exists status text not null default 'processing',
  add column if not exists attempts integer not null default 1,
  add column if not exists result text,
  add column if not exists error text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz;

create index if not exists webhook_events_status_idx
  on public.webhook_events (status, created_at desc);

comment on column public.webhook_events.status is 'processing | done | failed';

-- 3. Betaaltermijn van overschrijvingen -----------------------------------
-- Een overschrijving krijgt exact één week om binnen te komen. De matcher blijft
-- tot dat moment scannen; daarna wordt de betaling verlopen verklaard.
alter table public.verification_payments
  add column if not exists expires_at timestamptz,
  add column if not exists last_scanned_at timestamptz;

update public.verification_payments
   set expires_at = created_at + interval '7 days'
 where expires_at is null;

create index if not exists verification_payments_open_transfer_idx
  on public.verification_payments (status, expires_at)
  where status in ('pending', 'awaiting_transfer');

comment on column public.verification_payments.expires_at is
  'Overschrijvingen: uiterste moment (aanmaak + 7 dagen) waarna de betaling verloopt.';
comment on column public.verification_payments.last_scanned_at is
  'Laatste keer dat de SEPA-scanner deze openstaande betaling heeft nagekeken.';
