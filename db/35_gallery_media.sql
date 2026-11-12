-- Native mediagalerij: afbeeldingen van leden in onze eigen Neon-database.
-- Geen externe object store; bytes staan als base64 in `data` en worden
-- gestreamd door /api/public/gallery-media.
create table if not exists public.gallery_objects (
  path text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  content_type text not null,
  data text not null,
  created_at timestamptz not null default now()
);

create index if not exists gallery_objects_user_id_idx
  on public.gallery_objects (user_id, created_at desc);

alter table public.gallery_objects enable row level security;

grant select, insert, delete on public.gallery_objects to service_role;

drop policy if exists "Service role manages gallery media" on public.gallery_objects;
create policy "Service role manages gallery media" on public.gallery_objects
  for all to service_role
  using (true)
  with check (true);
