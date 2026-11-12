-- 58 — Steunpagina (rout.be/<handle>/tip): EPC-QR-instellingen + optionele eigen PSP-sleutels (BYOK).
-- ROUT verwerkt geen geld: de QR wijst naar de IBAN van de maker, PSP-knoppen naar diens eigen account. Idempotent.
create table if not exists public.tip_settings (
  user_id       uuid primary key,
  enabled       boolean not null default false,
  iban          text,
  account_name  text,
  presets_cents integer[] not null default '{500,1000,2500}',
  allow_custom  boolean not null default true,
  min_cents     integer not null default 100,
  message       text,
  image_urls    text[] not null default '{}',
  updated_at    timestamptz not null default now(),
  constraint tip_settings_images_max check (coalesce(array_length(image_urls, 1), 0) <= 3),
  constraint tip_settings_min_check check (min_cents between 1 and 500000)
);

-- Geheime sleutels worden enkel versleuteld (AES-256-GCM) bewaard; nooit in klare tekst.
create table if not exists public.psp_credentials (
  user_id     uuid not null,
  provider    text not null,
  ciphertext  text not null,
  iv          text not null,
  last4       text not null,
  mode        text not null default 'live',
  verified_at timestamptz not null default now(),
  primary key (user_id, provider),
  constraint psp_credentials_provider_check check (provider in ('stripe', 'mollie'))
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.tip_settings to rout_app;
    grant select, insert, update, delete on public.psp_credentials to rout_app;
  end if;
end $$;
