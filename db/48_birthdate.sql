-- 48. Geboortedatum (optioneel bij registratie, verplicht vóór een
-- verificatieaanvraag of betaalde actie). Aparte tabel: nooit publiek, nooit
-- via profielformulieren schrijfbaar. Idempotent.

create table if not exists public.user_birthdates (
  user_id     uuid primary key references public.users(id) on delete cascade,
  birthdate   date not null,
  source      text not null default 'user' check (source in ('user', 'google')),
  updated_at  timestamptz not null default now()
);
