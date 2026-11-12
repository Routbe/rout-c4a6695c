-- Temporary files shared via QR code, stored in the Scaleway client bucket. Idempotent.
create table if not exists public.shared_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bucket_key text not null,
  file_name text,
  content_type text not null,
  size_bytes integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists shared_files_expires_idx on public.shared_files (expires_at);
create index if not exists shared_files_user_idx on public.shared_files (user_id, created_at desc);
