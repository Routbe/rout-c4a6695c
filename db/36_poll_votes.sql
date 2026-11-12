-- Poll-stemmen voor het interactieve `poll`-blok.
-- Eén stem per (poll_key, voter_key); voter_key is een anonieme,
-- client-gegenereerde id — er is geen login nodig om te stemmen.
create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_key text not null,
  option_index integer not null check (option_index >= 0 and option_index < 6),
  voter_key text not null,
  created_at timestamptz not null default now(),
  unique (poll_key, voter_key)
);

create index if not exists poll_votes_poll_key_idx on public.poll_votes (poll_key);

alter table public.poll_votes enable row level security;

grant select, insert on public.poll_votes to anon, authenticated;
grant all on public.poll_votes to service_role;

-- Iedereen mag stemmen en uitslagen lezen; aanpassen/verwijderen kan niet.
create policy "poll votes are readable by everyone"
  on public.poll_votes for select
  to anon, authenticated
  using (true);

create policy "anyone can cast a vote"
  on public.poll_votes for insert
  to anon, authenticated
  with check (true);
