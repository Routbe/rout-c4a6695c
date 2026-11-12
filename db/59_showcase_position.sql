-- 59 — showcase_profiles existed before 52 without ordering columns. Idempotent.
alter table public.showcase_profiles add column if not exists position integer not null default 0;
alter table public.showcase_profiles add column if not exists created_at timestamptz not null default now();
