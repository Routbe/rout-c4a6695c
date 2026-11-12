-- 73 — Connections Hub: handle/address-based integrations with Pro/Social routing.
-- `verified` is only ever set server-side from a real sign-in (linked account).
create table if not exists public.user_integrations (
  user_id     uuid not null references public.users(id) on delete cascade,
  provider    text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  handle      text not null check (char_length(handle) between 1 and 200),
  audience    text not null default 'both' check (audience in ('pro', 'social', 'both')),
  visible     boolean not null default true,
  verified    boolean not null default false,
  status_json jsonb,
  status_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, provider)
);

create index if not exists user_integrations_user_visible_idx
  on public.user_integrations (user_id) where visible;

grant select, insert, update, delete on public.user_integrations to rout_app;
