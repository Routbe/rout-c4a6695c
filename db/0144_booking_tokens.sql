-- 0144: high-entropy gasttokens voor boekingen + Mastodon app-registratiecache.
-- Idempotent; raakt geen historische migraties.

-- 1. Boekingen krijgen een cryptografisch willekeurige token voor gasttoegang.
--    De bevestigingspagina toont gastgegevens alleen met deze token; zonder
--    token valt de API terug op een gemaskerde payload zonder PII.
alter table public.bookings
  add column if not exists booking_token text;

-- Bestaande rijen vullen (gen_random_bytes = CSPRNG, 32 bytes = 256 bits).
update public.bookings
   set booking_token = encode(gen_random_bytes(32), 'hex')
 where booking_token is null;

alter table public.bookings
  alter column booking_token set default encode(gen_random_bytes(32), 'hex');

create unique index if not exists bookings_booking_token_key
  on public.bookings (booking_token);

-- 2. Mastodon dynamic app registration cache: één registratie per instantie,
--    zodat repeat sign-ins geen nieuw POST /api/v1/apps verzoek triggeren.
--    Server-only tabel: bewust géén RLS-policy (deny by default, db/0120-regel).
create table if not exists public.mastodon_app_registrations (
  instance text not null,
  redirect_uri text not null,
  client_id text not null,
  client_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (instance, redirect_uri)
);
