-- 0196: scoped subjects for "Login met ROUT".
-- One row per (user, sector, key version). `subject` is HMAC(HKDF(master, sector, version), user id):
-- the internal account id never leaves the server, and each app (sector) sees an unlinkable value.
-- Older versions stay readable for `previous_sub` during a rotation; `revoked_at` ends a mapping.
-- Writes happen only in server code (table owner); members may read their own rows.
create table if not exists public.oidc_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sector text not null check (char_length(sector) between 1 and 300),
  version smallint not null check (version between 1 and 999),
  subject text not null check (subject ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, sector, version),
  unique (sector, subject)
);

create index if not exists oidc_subjects_sector_subject_live
  on public.oidc_subjects (sector, subject) where revoked_at is null;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select on public.oidc_subjects to rout_app;
  end if;
end $$;

alter table public.oidc_subjects enable row level security;
drop policy if exists rout_scope on public.oidc_subjects;
drop policy if exists oidc_subjects_read_own on public.oidc_subjects;
create policy oidc_subjects_read_own on public.oidc_subjects for select
  using (user_id = public.rout_current_user_id());

comment on table public.oidc_subjects is 'Scoped OIDC subjects per user, sector and key version; derived server-side only.';
