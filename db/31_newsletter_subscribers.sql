-- 31 — Nieuwsbrief-inschrijvingen (leads van het `newsletter`-profielblok).
--
-- De inschrijving wordt altijd eerst hier bewaard, zodat een maker zijn lijst
-- houdt ook wanneer Brevo niet (meer) geconfigureerd is. Brevo-dispatch is
-- optioneel en wordt per rij gelogd.
--
-- Server-only: alleen `service_role` mag lezen/schrijven; de inschrijving loopt
-- via de `subscribeNewsletter`-serverfunctie.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  email text not null,
  source text not null default 'profile',
  brevo_list_id integer,
  brevo_synced_at timestamptz,
  brevo_error text,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (handle, email)
);

create index if not exists newsletter_subscribers_handle_idx
  on public.newsletter_subscribers (handle, created_at desc);

alter table public.newsletter_subscribers enable row level security;

grant select, insert, update, delete on public.newsletter_subscribers to service_role;

drop policy if exists "Service role manages newsletter subscribers" on public.newsletter_subscribers;
create policy "Service role manages newsletter subscribers" on public.newsletter_subscribers
  for all to service_role
  using (true)
  with check (true);
