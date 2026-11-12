-- 70. Sovereign OS: Pro-wachtlijst, eenvoudige integraties, status-webhook, agenda-feed.
-- Idempotent; uitvoeren als eigenaar (MIGRATION_URL).

create table if not exists public.pro_waitlist (
  user_id    uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Integraties die alleen een gebruikersnaam/URL (of WakaTime-sleutel) nodig hebben.
create table if not exists public.user_integration_links (
  user_id         uuid not null references public.users(id) on delete cascade,
  provider        text not null,
  handle_or_url   text not null,
  secret_enc      text,
  secret_iv       text,
  show_on_profile boolean not null default true,
  updated_at      timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Persoonlijk webhook-adres (Home Assistant / Shortcuts); enkel de hash staat hier.
create table if not exists public.profile_ingest_tokens (
  user_id    uuid primary key references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

-- iCal/.ics-feed voor automatische agenda-status.
create table if not exists public.user_calendar_feeds (
  user_id        uuid primary key references public.users(id) on delete cascade,
  url            text not null,
  enabled        boolean not null default true,
  busy_text      text,
  last_synced_at timestamptz,
  updated_at     timestamptz not null default now()
);

grant select, insert, update, delete on
  public.pro_waitlist, public.user_integration_links,
  public.profile_ingest_tokens, public.user_calendar_feeds
to rout_app;
