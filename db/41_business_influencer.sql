-- 41 — Bedrijfsverificatie (zwarte badge) en influencerverificatie (roze badge).
--
-- Beide lopen via een manuele goedkeuring door een beheerder:
--   • bedrijf     → officiële naam, rechtsvorm, btw-nummer, adres, domeinnaam
--                   na goedkeuring: rout.be/<domeinnaam>, bv. rout.be/rout.be
--   • influencer  → vier handlevoorkeuren (1 t/m 4) + sociale kanalen
--                   kost € 70, of € 0 wanneer het account al geverifieerd is

create table if not exists public.business_verifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  company_name   text not null,
  legal_form     text,
  vat_number     text not null,
  address        text,
  country        text,
  website_domain text not null,
  contact_name   text,
  contact_email  text,
  status         text not null default 'pending',
  admin_note     text,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid
);

alter table public.business_verifications
  drop constraint if exists business_verifications_status_check;
alter table public.business_verifications
  add constraint business_verifications_status_check
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists business_verifications_user_idx
  on public.business_verifications (user_id, created_at desc);
create index if not exists business_verifications_status_idx
  on public.business_verifications (status, created_at desc);

create table if not exists public.influencer_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  handle_choices text[] not null default '{}',
  social_links   jsonb not null default '[]'::jsonb,
  motivation     text,
  fee_cents      integer not null default 7000,
  paid           boolean not null default false,
  status         text not null default 'pending',
  granted_handle text,
  admin_note     text,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid
);

alter table public.influencer_requests
  drop constraint if exists influencer_requests_status_check;
alter table public.influencer_requests
  add constraint influencer_requests_status_check
  check (status in ('pending', 'awaiting_payment', 'approved', 'rejected'));

create index if not exists influencer_requests_user_idx
  on public.influencer_requests (user_id, created_at desc);
create index if not exists influencer_requests_status_idx
  on public.influencer_requests (status, created_at desc);

-- Resultaat van een goedkeuring, zichtbaar op het publieke profiel.
alter table public.profiles
  add column if not exists is_business boolean not null default false,
  add column if not exists business_name text,
  add column if not exists business_vat text,
  add column if not exists is_influencer boolean not null default false;
