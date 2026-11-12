-- 0143: schema grants & sequence alignment (delta, idempotent).
--
-- Live Neon week op negen punten af van de migration replay (grant- en
-- sequence-verschillen) en de checksum van historische 91_shadowban.sql wijkt
-- af. Historische migraties zijn immuut en worden NOOIT aangepast; deze delta
-- lijnt de grants declaratief uit. De checksum-afwijking is gedocumenteerd in
-- docs/identity-broker-preflight.md en ENVIRONMENT.md.
--
-- RLS-model (db/0120): één rout_scope-policy per tabel; secret/server-only
-- tabellen krijgen bewust geen policy (deny by default). De authenticator-
-- rol mag alleen lezen/schrijven via die policies.

do $$
declare
  t text;
  -- Tabellen die de applicatie-server onder RLS moet kunnen bereiken.
  rls_tables text[] := array[
    'users', 'profiles', 'workspaces', 'workspace_members',
    'bookings', 'booking_event_types', 'booking_event_type_hosts',
    'connected_calendars', 'availability_cache',
    'custom_domains', 'short_links', 'profile_events',
    'oauth_clients', 'oauth_authorization_requests', 'oauth_email_forwarding_rules',
    'promo_codes', 'promo_code_events', 'gift_cards',
    'entitlement_overrides', 'rate_limits', 'security_audit_logs'
  ];
begin
  foreach t in array rls_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      -- Lees/schrijfrechten voor de applicatierol blijven onder RLS vallen.
      execute format('grant select, insert, update, delete on public.%I to rout_app', t);
    end if;
  end loop;
end $$;

-- Server-only tabellen: expliciet géén grants voor de applicatierol.
do $$
declare
  t text;
  server_only text[] := array[
    'mastodon_app_registrations', 'oauth_email_deliveries',
    'bunq_oauth_tokens', 'signing_keys', 'verification_codes'
  ];
begin
  foreach t in array server_only loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from rout_app', t);
    end if;
  end loop;
end $$;

-- Sequences: zorg dat owned sequences dezelfde rechten volgen als hun tabel.
do $$
declare
  s record;
begin
  for s in
    select sequence_schema, sequence_name
      from information_schema.sequences
     where sequence_schema = 'public'
  loop
    execute format('grant usage, select on sequence public.%I to rout_app', s.sequence_name);
  end loop;
end $$;
