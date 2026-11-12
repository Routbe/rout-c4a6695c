-- 0139: granular selective-disclosure scopes, trusted KYC partners, back-channel
-- email sync webhooks and a GDPR disclosure log for "Login met ROUT".
-- The webhook secret is stored sealed (AES-256-GCM under the provider KEK), never in plain text.

alter table public.oauth_clients
  add column if not exists allowed_scopes text[] not null default array['openid', 'profile:read', 'sybil:verify'],
  add column if not exists is_trusted_kyc_partner boolean not null default false,
  add column if not exists backchannel_webhook_url text,
  add column if not exists backchannel_webhook_secret_sealed text,
  add column if not exists backchannel_webhook_secret_iv text;

alter table public.oauth_clients drop constraint if exists oauth_clients_backchannel_url_https;
alter table public.oauth_clients add constraint oauth_clients_backchannel_url_https
  check (backchannel_webhook_url is null or (backchannel_webhook_url like 'https://%' and char_length(backchannel_webhook_url) <= 2048));

create table if not exists public.identity_disclosure_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 200),
  disclosed_scopes text[] not null,
  disclosed_at timestamptz not null default now(),
  ip_hash text not null check (char_length(ip_hash) between 1 and 128)
);
create index if not exists identity_disclosure_logs_user_idx
  on public.identity_disclosure_logs (user_id, disclosed_at desc);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    -- Append-only: no update or delete for the runtime role.
    grant select, insert on public.identity_disclosure_logs to rout_app;
  end if;
end $$;

alter table public.identity_disclosure_logs enable row level security;
drop policy if exists rout_scope on public.identity_disclosure_logs;
create policy rout_scope on public.identity_disclosure_logs
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());
