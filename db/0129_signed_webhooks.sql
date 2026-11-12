-- 0129: outbound webhooks signed with X-Rout-Signature (HMAC-SHA256 + timestamp)
-- and a delivery queue with exponential backoff.
create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  workspace_id uuid,
  url text not null check (url ~ '^https://' and char_length(url) <= 2048),
  events text[] not null default '{}',
  secret_ciphertext text not null,
  secret_iv text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists webhook_endpoints_owner_idx on public.webhook_endpoints (owner_user_id);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  payload_json jsonb not null,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status int,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at)
  where delivered_at is null and failed_at is null;

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
drop policy if exists rout_scope on public.webhook_endpoints;
create policy rout_scope on public.webhook_endpoints
  using (owner_user_id = public.rout_current_user_id())
  with check (owner_user_id = public.rout_current_user_id());
-- webhook_deliveries: server-only (no policy).

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.webhook_endpoints to rout_app;
    grant select, insert, update on public.webhook_deliveries to rout_app;
  end if;
end $$;
