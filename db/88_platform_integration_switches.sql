-- 88 — Platform-wide killswitches per integration provider.
-- mode: 'on' (normal), 'paused' (cards show cached data, no live fetch, no new links),
--       'off' (hidden everywhere, new links refused).
create table if not exists public.platform_integration_switches (
  provider    text primary key,
  mode        text not null default 'on' check (mode in ('on', 'paused', 'off')),
  note        text,
  updated_by  uuid references public.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.platform_integration_switches enable row level security;
