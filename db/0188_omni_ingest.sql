-- Omni-Matrix ingestion: asynchronous link resolution into first-party storage.
-- Results land in an owner-only inbox; cards only reach the public hub through
-- the existing revisioned draft -> publish flow (no draft leaks, one source of truth).
create table public.omni_ingest_tokens (
  user_id uuid primary key references public.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.omni_ingest_tokens to rout_app;
alter table public.omni_ingest_tokens enable row level security;
alter table public.omni_ingest_tokens force row level security;
create policy omni_token_owner on public.omni_ingest_tokens for all to rout_app
  using (user_id = public.rout_current_user_id()) with check (user_id = public.rout_current_user_id());

create type public.omni_content_type as enum ('article','podcast','program','short','event','social');
create type public.omni_job_status as enum ('queued','processing','ready','failed');

create table public.omni_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source text not null check (source in ('studio','webhook')),
  source_url text not null check (source_url ~ '^https://' and char_length(source_url) <= 2000),
  title_override text check (char_length(title_override) <= 150),
  media_hint text check (media_hint ~ '^https://' and char_length(media_hint) <= 2000),
  status public.omni_job_status not null default 'queued',
  content_type public.omni_content_type,
  title text check (char_length(title) <= 150),
  meta_tag text check (char_length(meta_tag) <= 40),
  target_url text check (char_length(target_url) <= 2000),
  -- First-party storage paths only ("<user_id>/omni-..."), never external CDN URLs.
  local_media_path text check (local_media_path ~ '^[0-9a-f-]{36}/omni-[A-Za-z0-9._-]{1,120}$'),
  kinetic_preview_path text check (kinetic_preview_path ~ '^[0-9a-f-]{36}/omni-[A-Za-z0-9._-]{1,120}$'),
  error text check (char_length(error) <= 120),
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.omni_ingest_jobs to rout_app;
alter table public.omni_ingest_jobs enable row level security;
alter table public.omni_ingest_jobs force row level security;
create policy omni_job_owner on public.omni_ingest_jobs for all to rout_app
  using (user_id = public.rout_current_user_id()) with check (user_id = public.rout_current_user_id());
create index omni_jobs_owner_recent on public.omni_ingest_jobs(user_id, created_at desc);

-- Webhooks have no session: resolve the owner from a SHA-256 token hash only.
create function public.rout_ingest_token_owner(p_hash text) returns uuid
language sql stable security definer set search_path = pg_catalog, public as $$
  select user_id from public.omni_ingest_tokens where token_hash = p_hash
$$;
revoke all on function public.rout_ingest_token_owner(text) from public;
grant execute on function public.rout_ingest_token_owner(text) to rout_app;
