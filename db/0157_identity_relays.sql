-- 0157: identity relays — foundation for sovereign privacy proxying.
-- One generated ROUT proxy address per member + connected app ("Login met ROUT"
-- OIDC client), mapped to the member's real target address. Forwarding itself
-- stays in oauth_email_forwarding_rules (0137) until the relay engine moves here.
create table if not exists public.identity_relays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  connected_app_id text not null references public.oauth_clients (client_id) on delete cascade,
  proxy_email text not null unique
    check (char_length(proxy_email) <= 254 and proxy_email ~ '^[a-z0-9][a-z0-9._-]{2,63}@[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  target_email text not null
    check (char_length(target_email) between 3 and 254 and position('@' in target_email) > 1),
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connected_app_id)
);

create index if not exists identity_relays_user on public.identity_relays (user_id, status);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.identity_relays to rout_app;
  end if;
end $$;

alter table public.identity_relays enable row level security;
drop policy if exists rout_scope on public.identity_relays;
create policy rout_scope on public.identity_relays
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());
