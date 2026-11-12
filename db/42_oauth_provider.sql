-- 42 — "Login met ROUT": native OAuth 2.1 / OIDC provider.
--
-- Ontwikkelaars registreren hun app in de Developer Console. Elke app hoort bij
-- de gebruiker die ze aanmaakte. Secrets worden uitsluitend gehasht bewaard,
-- autorisatiecodes zijn kortlevend, eenmalig en gehasht, en redirect-URI's
-- worden exact vergeleken.

create table if not exists public.oauth_clients (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  client_id      text not null unique,
  secret_hash    text,
  name           text not null,
  logo_url       text,
  homepage_url   text,
  privacy_url    text,
  terms_url      text,
  redirect_uris  text[] not null default '{}',
  scopes         text[] not null default '{openid,profile}',
  status         text not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  secret_rotated_at timestamptz
);

alter table public.oauth_clients drop constraint if exists oauth_clients_status_check;
alter table public.oauth_clients
  add constraint oauth_clients_status_check check (status in ('active', 'disabled'));

create index if not exists oauth_clients_owner_idx
  on public.oauth_clients (owner_user_id, created_at desc);

-- Autorisatiecodes: gehasht, eenmalig, kortlevend, met verplichte PKCE S256.
create table if not exists public.oauth_auth_codes (
  code_hash       text primary key,
  client_id       text not null,
  user_id         uuid not null,
  redirect_uri    text not null,
  scopes          text[] not null default '{}',
  code_challenge  text not null,
  nonce           text,
  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists oauth_auth_codes_expiry_idx on public.oauth_auth_codes (expires_at);

-- Onthouden welke gebruiker welke app al toestemming gaf (scope-exact).
create table if not exists public.oauth_consents (
  user_id    uuid not null,
  client_id  text not null,
  scopes     text[] not null default '{}',
  granted_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- Ondertekensleutel (ES256). De private JWK blijft server-side; alleen de
-- publieke helft verlaat de server via JWKS.
create table if not exists public.oauth_signing_keys (
  kid         text primary key,
  private_jwk jsonb not null,
  public_jwk  jsonb not null,
  created_at  timestamptz not null default now(),
  retired_at  timestamptz
);
