-- 38 — Aparte gratis aliasprofielen (naast het geverifieerde rootprofiel).
--
-- Elke gebruiker kan twee volledig losstaande publieke profielen beheren:
--   • het geverifieerde profiel op de rootnamespace  → public.profiles
--   • een gratis aliasprofiel op /u/<handle>         → public.alias_profiles
-- Het aliasprofiel heeft eigen handle, naam, thema, blokken en voorkeuren.

create table if not exists public.alias_profiles (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  handle         text not null,
  display_name   text,
  tagline        text,
  bio            text,
  avatar_url     text,
  favicon_url    text,
  theme          text not null default 'noir',
  card_style     text not null default 'bordered',
  blocks         jsonb not null default '[]'::jsonb,
  display_prefs  jsonb not null default '{}'::jsonb,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Handles zijn case-insensitief uniek binnen de aliasruimte.
create unique index if not exists alias_profiles_handle_ci_key
  on public.alias_profiles (lower(handle));
