-- 45 — Whitelist van door de beheerder goedgekeurde namen per verificatieaanvraag.
-- De gebruiker kiest er later precies één uit (claim). Idempotent.

create table if not exists public.approved_handles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  request_id   uuid not null,
  request_kind text not null,
  handle       text not null,
  status       text not null default 'approved',
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz
);

alter table public.approved_handles drop constraint if exists approved_handles_kind_check;
alter table public.approved_handles
  add constraint approved_handles_kind_check check (request_kind in ('influencer', 'business'));
alter table public.approved_handles drop constraint if exists approved_handles_status_check;
alter table public.approved_handles
  add constraint approved_handles_status_check check (status in ('approved', 'claimed', 'void'));

create unique index if not exists approved_handles_user_handle_idx
  on public.approved_handles (user_id, lower(handle));
create index if not exists approved_handles_user_idx on public.approved_handles (user_id, status);
