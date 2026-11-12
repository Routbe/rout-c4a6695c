-- 0137: private relay addresses for "Login met ROUT" (priv-<id>@mail.rout.be).
-- A rule maps one relay alias (per user + app) to the user's verified email.
-- Deliveries keep transport metadata only: never sender, subject or content.
create table if not exists public.oauth_email_forwarding_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id text not null check (char_length(client_id) between 1 and 200),
  alias_local text not null unique check (alias_local ~ '^priv-[a-f0-9]{20}$'),
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.oauth_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.oauth_email_forwarding_rules (id) on delete cascade,
  user_id uuid,
  status text not null check (status in ('forwarded', 'rejected', 'failed')),
  reason text check (reason is null or char_length(reason) <= 40),
  size_bytes integer check (size_bytes is null or size_bytes >= 0),
  message_id_hash text check (message_id_hash is null or message_id_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create unique index if not exists oauth_email_deliveries_dedupe
  on public.oauth_email_deliveries (rule_id, message_id_hash)
  where message_id_hash is not null and status = 'forwarded';
create index if not exists oauth_email_deliveries_rule_time
  on public.oauth_email_deliveries (rule_id, created_at desc);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update on public.oauth_email_forwarding_rules to rout_app;
    grant select, insert on public.oauth_email_deliveries to rout_app;
  end if;
end $$;

alter table public.oauth_email_forwarding_rules enable row level security;
drop policy if exists rout_scope on public.oauth_email_forwarding_rules;
create policy rout_scope on public.oauth_email_forwarding_rules
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());

alter table public.oauth_email_deliveries enable row level security;
drop policy if exists rout_scope on public.oauth_email_deliveries;
create policy rout_scope on public.oauth_email_deliveries
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());
