-- Aflevermonitor voor facturen/Brevo-mails + kleine schema-aanvullingen voor
-- externe (GitLab/GitHub/Google) identiteiten en het Early Believer-plafond.

-- 1. Externe auth-identiteiten: `public.user_identities` (db/14) is de bron van
--    waarheid voor provider + provider_account_id. GitLab levert daarnaast een
--    handle, die we hier expliciet kunnen bewaren.
create table if not exists public.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  email text,
  avatar_url text,
  display_name text,
  created_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);

alter table public.user_identities add column if not exists username text;
alter table public.user_identities add column if not exists avatar_url text;
alter table public.user_identities add column if not exists display_name text;
alter table public.user_identities add column if not exists email text;

create index if not exists user_identities_provider_idx
  on public.user_identities (provider, provider_account_id);

-- 2. Early Believer is gecapt op 50.000 exemplaren; het serienummer van
--    public.user_badges is het claimnummer (#X van 50.000).
update public.badges set max_supply = 50000
 where slug in ('early_believer', 'early-believer')
   and (max_supply is null or max_supply <> 50000);

-- 3. Afleverstatus per betaling: factuurnummer, PDF-bijlage en Brevo-mail.
create table if not exists public.invoice_deliveries (
  payment_id uuid primary key,
  user_id uuid,
  invoice_number text,
  template text,
  attached boolean not null default false,
  emailed boolean not null default false,
  status text not null default 'pending',
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_deliveries_status_idx
  on public.invoice_deliveries (status, updated_at desc);
