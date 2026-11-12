-- Native ROUT booking component: afspraakaanvragen vanaf publieke profielen.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  guest_name text not null,
  guest_email text not null,
  preferred_date date not null,
  preferred_time text not null,
  guest_message text,
  duration_minutes integer not null default 30,
  title text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_requests_profile_idx
  on public.booking_requests (profile_id, created_at desc);

alter table public.booking_requests enable row level security;

grant select, insert, update on public.booking_requests to service_role;

drop policy if exists "Service role manages bookings" on public.booking_requests;
create policy "Service role manages bookings" on public.booking_requests
  for all to service_role
  using (true)
  with check (true);
