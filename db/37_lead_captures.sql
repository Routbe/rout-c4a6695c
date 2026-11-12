-- Inzendingen van het `contact_form`-blok (contactformulier / e-mailcapture).
create table if not exists public.lead_captures (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  name text,
  email text not null,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists lead_captures_handle_idx on public.lead_captures (handle, created_at desc);

alter table public.lead_captures enable row level security;

grant insert on public.lead_captures to anon, authenticated;
grant select on public.lead_captures to authenticated;
grant all on public.lead_captures to service_role;

-- Bezoekers mogen enkel toevoegen; lezen gebeurt server-side voor de eigenaar.
create policy "anyone can submit a lead"
  on public.lead_captures for insert
  to anon, authenticated
  with check (true);
