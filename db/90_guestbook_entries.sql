-- 90 — Verified guestbook: signed-in ROUT members leave short notes; owners pin the best ones publicly.
create table if not exists public.guestbook_entries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  author_id   uuid not null references public.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 150),
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists guestbook_entries_owner_idx on public.guestbook_entries (owner_id, created_at desc);
create index if not exists guestbook_entries_pinned_idx on public.guestbook_entries (owner_id) where pinned;
create index if not exists guestbook_entries_author_idx on public.guestbook_entries (author_id, created_at desc);
grant select, insert, update, delete on public.guestbook_entries to rout_app;
