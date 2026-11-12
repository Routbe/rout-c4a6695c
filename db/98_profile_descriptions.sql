alter table public.profiles add column if not exists profile_descriptions jsonb not null default '{}'::jsonb;
alter table public.alias_profiles add column if not exists profile_descriptions jsonb not null default '{}'::jsonb;
