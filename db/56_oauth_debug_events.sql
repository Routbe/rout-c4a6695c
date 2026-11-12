-- Live Auth debugger: redacted log of "Login met ROUT" attempts per app.
-- Privacy: never stores IP addresses, user ids, tokens, codes or secrets.
create table if not exists public.oauth_debug_events (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  endpoint text not null,
  outcome text not null,
  error_code text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists oauth_debug_events_client_created_idx
  on public.oauth_debug_events (client_id, created_at desc);
grant select, insert, delete on public.oauth_debug_events to rout_app;
