-- Custom live status (Sovereign Ingestion API) and privacy rules per member.
create table if not exists public.user_custom_presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  status_text text,
  icon text,
  category text not null default 'custom',
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  api_key_hash text unique,
  api_key_created_at timestamptz,
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
