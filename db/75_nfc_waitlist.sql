-- 75 — Interest list for physical NFC business cards (no orders yet).
create table if not exists public.nfc_waitlist (
  user_id    uuid primary key references public.users(id) on delete cascade,
  material   text check (material in ('wood', 'metal', 'matte_black')),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.nfc_waitlist to rout_app;
