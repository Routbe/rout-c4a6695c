-- Admin-chosen real profiles shown as live phone previews on home/about. Idempotent.
create table if not exists public.showcase_profiles (
  handle text primary key,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.showcase_profiles (handle, position) values ('maximilien.brussels', 0)
on conflict (handle) do nothing;
