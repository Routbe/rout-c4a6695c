-- Avatar storage on our own Neon database (no external object store).
create table if not exists public.avatar_objects (
  path text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  content_type text not null,
  data text not null,
  created_at timestamptz not null default now()
);

create index if not exists avatar_objects_user_id_idx on public.avatar_objects (user_id);
