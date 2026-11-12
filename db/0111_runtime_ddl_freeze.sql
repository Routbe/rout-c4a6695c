-- 0111 — Runtime-DDL freeze (RFC-001 §1.3).
-- Every "create table / add column if not exists" that used to run inside the
-- app (runSchemaEnsure safety nets) now lives here. Fully idempotent: on a
-- database where the objects exist this is a no-op. App code no longer runs DDL.

-- formerly in src/lib/admin-access.server.ts
alter table public.profiles
  add column if not exists legal_first_name text,
  add column if not exists legal_last_name text,
  add column if not exists verified_legal_name text;

-- formerly in src/lib/alias-profile.server.ts
create table if not exists public.alias_profiles (
    user_id        uuid primary key references public.profiles(id) on delete cascade,
    handle         text not null,
    display_name   text,
    tagline        text,
    bio            text,
    avatar_url     text,
    favicon_url    text,
    theme          text not null default 'noir',
    card_style     text not null default 'bordered',
    blocks         jsonb not null default '[]'::jsonb,
    display_prefs  jsonb not null default '{}'::jsonb,
    enabled        boolean not null default true,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
  );
create unique index if not exists alias_profiles_handle_ci_key
  on public.alias_profiles (lower(handle));

-- formerly in src/lib/approved-handles.server.ts
create table if not exists public.approved_handles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    request_id uuid not null,
    request_kind text not null,
    handle text not null,
    status text not null default 'approved',
    created_at timestamptz not null default now(),
    claimed_at timestamptz
  );
create unique index if not exists approved_handles_user_handle_idx
  on public.approved_handles (user_id, lower(handle));

-- formerly in src/lib/assets.server.ts
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

-- formerly in src/lib/badge-claims.server.ts
create table if not exists public.badge_claim_links (
  id uuid primary key default gen_random_uuid(), token text not null unique,
  badge_id uuid not null references public.custom_badges(id) on delete cascade, reason text,
  max_claims integer, claims_count integer not null default 0, expires_at timestamptz, revoked_at timestamptz,
  created_by uuid, created_at timestamptz not null default now());
create table if not exists public.badge_claim_redemptions (
  link_id uuid not null references public.badge_claim_links(id) on delete cascade, user_id uuid not null,
  claimed_at timestamptz not null default now(), primary key (link_id, user_id));

-- formerly in src/lib/birthdate.server.ts
create table if not exists public.user_birthdates (
    user_id uuid primary key references public.users(id) on delete cascade,
    birthdate date not null,
    source text not null default 'user',
    updated_at timestamptz not null default now()
  );

-- formerly in src/lib/custom-presence.server.ts
create table if not exists public.user_custom_presence (
    user_id uuid primary key references public.users(id) on delete cascade,
    status_text text, icon text, category text not null default 'custom',
    metadata jsonb not null default '{}'::jsonb, expires_at timestamptz,
    api_key_hash text unique, api_key_created_at timestamptz,
    rules jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
  );

-- formerly in src/lib/fediverse-otp.server.ts
create table if not exists public.fediverse_email_otp (
    pending_key text primary key, email text not null, code_hash text not null,
    attempts integer not null default 0, locked_until timestamptz,
    expires_at timestamptz not null, created_at timestamptz not null default now()
  );

-- formerly in src/lib/forwarding.server.ts
create table if not exists public.forwarding_confirmation_sends (
    id         bigint generated always as identity primary key,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    recipient  text not null,
    sent_at    timestamptz not null default now()
  );
create index if not exists fwd_conf_sends_user_idx
  on public.forwarding_confirmation_sends (user_id, sent_at);
create index if not exists fwd_conf_sends_recipient_idx
  on public.forwarding_confirmation_sends (lower(recipient), sent_at);

-- formerly in src/lib/identities.server.ts
create table if not exists public.identity_labels (
  account_id text primary key, provider text not null, label text not null, updated_at timestamptz not null default now());

-- formerly in src/lib/identity/identity.server.ts
create table if not exists public.didit_monthly_usage (
  month date primary key, success_count integer not null default 0);

-- formerly in src/lib/login-code.server.ts
create table if not exists public.login_codes (
  id bigserial primary key, email_hash text not null, code_hash text not null,
  link text not null, expires_at timestamptz not null, created_at timestamptz not null default now());

-- formerly in src/lib/oauth/debug-events.server.ts
create table if not exists public.oauth_debug_events (
    id uuid primary key default gen_random_uuid(),
    client_id text not null,
    endpoint text not null,
    outcome text not null,
    error_code text,
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

-- formerly in src/lib/oauth/provider.server.ts
create table if not exists public.oauth_clients (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null,
    client_id text not null unique,
    secret_hash text,
    name text not null,
    logo_url text,
    homepage_url text,
    privacy_url text,
    terms_url text,
    redirect_uris text[] not null default '{}',
    scopes text[] not null default '{openid,profile}',
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    secret_rotated_at timestamptz
  );
create table if not exists public.oauth_auth_codes (
    code_hash text primary key,
    client_id text not null,
    user_id uuid not null,
    redirect_uri text not null,
    scopes text[] not null default '{}',
    code_challenge text not null,
    nonce text,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    created_at timestamptz not null default now()
  );
create table if not exists public.oauth_consents (
    user_id uuid not null,
    client_id text not null,
    scopes text[] not null default '{}',
    granted_at timestamptz not null default now(),
    primary key (user_id, client_id)
  );
create table if not exists public.oauth_signing_keys (
    kid text primary key,
    private_jwk jsonb not null,
    public_jwk jsonb not null,
    created_at timestamptz not null default now(),
    retired_at timestamptz
  );
alter table public.oauth_clients add column if not exists flow_preference text not null default 'seamless';
alter table public.oauth_clients add column if not exists rich_identity_enabled boolean not null default false;
alter table public.oauth_clients add column if not exists handle_sync_enabled boolean not null default false;
alter table public.oauth_auth_codes add column if not exists acr text;
alter table public.oauth_auth_codes add column if not exists rich_identity boolean not null default false;
create table if not exists public.oauth_step_up_codes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    client_id text not null,
    code_hash text not null,
    attempts int not null default 0,
    expires_at timestamptz not null,
    verified_at timestamptz,
    consumed_at timestamptz,
    created_at timestamptz not null default now()
  );
alter table public.oauth_clients add column if not exists publishing_status text not null default 'testing';
alter table public.oauth_clients add column if not exists support_email text;
alter table public.oauth_clients add column if not exists legal_owner text;
alter table public.oauth_clients add column if not exists dpo_email text;
alter table public.oauth_clients add column if not exists require_pkce boolean not null default true;
alter table public.oauth_clients add column if not exists access_token_ttl integer not null default 3600;
alter table public.oauth_clients add column if not exists allowed_ips text[] not null default '{}';
alter table public.oauth_clients add column if not exists account_discovery_enabled boolean not null default false;
alter table public.oauth_clients add column if not exists description text;
create table if not exists public.oauth_client_test_users (
    id uuid primary key default gen_random_uuid(),
    client_id text not null,
    identifier text not null,
    created_at timestamptz not null default now(),
    unique (client_id, identifier)
  );
create table if not exists public.oauth_client_verification_requests (
    id uuid primary key default gen_random_uuid(),
    client_id text not null,
    requested_by uuid not null,
    status text not null default 'pending',
    note text,
    reviewed_by uuid,
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
  );

-- formerly in src/lib/phone/phone-otp.server.ts
create table if not exists public.user_phone_numbers (
  user_id uuid primary key, phone_number_enc text not null, phone_hash text not null,
  phone_last4 text not null, phone_verified boolean not null default false,
  phone_verified_at timestamptz, updated_at timestamptz not null default now());
create table if not exists public.phone_otp_codes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, phone_hash text not null,
  phone_number_enc text not null, phone_last4 text not null, code_hash text not null,
  attempts int not null default 0, expires_at timestamptz not null, consumed_at timestamptz,
  created_at timestamptz not null default now());

-- formerly in src/lib/pricing-settings.server.ts
create table if not exists public.pricing_settings (
    id int primary key default 1,
    verification_base_cents int not null default 399,
    fee_card_cents int not null default 999,
    fee_bunq_cents int not null default 499,
    fee_sepa_cents int not null default 0,
    min_donation_cents int not null default 100,
    updated_at timestamptz not null default now(),
    updated_by uuid,
    constraint pricing_settings_single_row check (id = 1)
  );

-- formerly in src/lib/profile-drafts.server.ts
create table if not exists public.profile_drafts (
    user_id uuid not null references public.profiles(id) on delete cascade,
    space text not null check (space in ('verified', 'alias')),
    payload jsonb not null default '{}'::jsonb,
    revision bigint not null default 1,
    published_revision bigint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    published_at timestamptz,
    primary key (user_id, space)
  );

-- formerly in src/lib/questions.server.ts
create table if not exists public.profile_questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  answer text check (answer is null or char_length(answer) between 1 and 1000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz);

-- formerly in src/lib/rate-limit-db.server.ts
create table if not exists public.rate_limits (
  bucket text not null, window_start timestamptz not null, hits int not null default 0,
  primary key (bucket, window_start));

-- formerly in src/lib/showcase.functions.ts
create table if not exists public.showcase_profiles (handle text primary key, position integer not null default 0, created_at timestamptz not null default now());

-- formerly in src/lib/telegram-bot.server.ts
create table if not exists public.telegram_verify_sessions (
  chat_id bigint primary key, phone_enc text not null, expires_at timestamptz not null);

-- formerly in src/lib/total-reach.server.ts
alter table public.user_integrations
  add column if not exists include_in_reach boolean not null default true,
  add column if not exists follower_count integer,
  add column if not exists manual_follower_count integer,
  add column if not exists reach_synced_at timestamptz;

-- formerly in src/lib/tour-draft.server.ts
create table if not exists public.onboarding_drafts (
    email text primary key,
    draft jsonb not null,
    updated_at timestamptz not null default now()
  );

-- formerly in src/lib/verification-requests.server.ts
create table if not exists public.business_verifications (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null,
    company_name   text not null,
    legal_form     text,
    vat_number     text not null,
    address        text,
    country        text,
    website_domain text not null,
    contact_name   text,
    contact_email  text,
    status         text not null default 'pending',
    admin_note     text,
    created_at     timestamptz not null default now(),
    reviewed_at    timestamptz,
    reviewed_by    uuid
  );
create table if not exists public.influencer_requests (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null,
    handle_choices text[] not null default '{}',
    social_links   jsonb not null default '[]'::jsonb,
    motivation     text,
    fee_cents      integer not null default 7000,
    paid           boolean not null default false,
    status         text not null default 'pending',
    granted_handle text,
    admin_note     text,
    created_at     timestamptz not null default now(),
    reviewed_at    timestamptz,
    reviewed_by    uuid
  );
alter table public.profiles
  add column if not exists is_business boolean not null default false,
  add column if not exists business_name text,
  add column if not exists business_vat text,
  add column if not exists is_influencer boolean not null default false;

-- formerly in src/lib/visits.server.ts
create table if not exists public.profile_visits (
    id              bigserial primary key,
    profile_user_id uuid,
    handle          text not null,
    space           text not null default 'alias',
    path            text,
    locale          text,
    country         text,
    device          text,
    visitor_hash    text,
    created_at      timestamptz not null default now()
  );
create index if not exists profile_visits_user_time_idx
  on public.profile_visits (profile_user_id, created_at desc);
create index if not exists profile_visits_handle_time_idx
  on public.profile_visits (lower(handle), created_at desc);
create table if not exists public.profile_link_clicks (
    id bigserial primary key, profile_user_id uuid, handle text not null,
    block_id text not null, label text, space text not null default 'alias',
    visitor_hash text, created_at timestamptz not null default now()
  );

-- formerly in src/lib/pricing-settings.server.ts (seed row)
insert into public.pricing_settings (id) values (1) on conflict (id) do nothing;
