-- 68 — Live Presence integrations (Spotify first). Tokens are AES-GCM sealed
-- with PSP_ENCRYPTION_KEY; the public flag decides what visitors may see.
create table if not exists public.user_presence_connections (
  user_id            uuid not null references public.users(id) on delete cascade,
  provider           text not null check (provider in ('spotify')),
  account_name       text,
  access_token_enc   text not null,
  access_token_iv    text not null,
  refresh_token_enc  text,
  refresh_token_iv   text,
  expires_at         timestamptz not null,
  show_on_profile    boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, provider)
);

grant select, insert, update, delete on public.user_presence_connections to rout_app;
