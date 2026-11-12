-- Asset Manager: retentie van uploads in Scaleway (free 7–90 dagen, Pro/Verified permanent).
create table if not exists public.user_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bucket_kind text not null default 'client',
  s3_key text not null,
  file_name text not null,
  file_size bigint not null default 0,
  content_type text not null,
  is_lifetime boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_assets_user on public.user_assets(user_id);
create index if not exists idx_user_assets_expires on public.user_assets(expires_at) where expires_at is not null;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.user_assets to rout_app;
  end if;
end $$;

-- Telegram-verificatie: gedeeld contact (versleuteld) per chat, kortlevend.
create table if not exists public.telegram_verify_sessions (
  chat_id bigint primary key,
  phone_enc text not null,
  expires_at timestamptz not null
);
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.telegram_verify_sessions to rout_app;
  end if;
end $$;
