-- Identity ownership is distinct from permission to log in.
create table public.identity_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  provider text not null,
  issuer text not null check (issuer = lower(issuer) and issuer !~ '/$'),
  provider_sub text not null check (length(provider_sub) > 0),
  display_handle text,
  proof_method text not null check (proof_method in ('oidc_id_token','oauth_userinfo','atproto_oauth','dns_txt','rel_me')),
  proof_digest bytea not null check (octet_length(proof_digest) = 32),
  step_up_method text not null check (step_up_method in ('passkey','totp','email_code','signup')),
  step_up_at timestamptz not null,
  status text not null default 'verified' check (status in ('verified','revoked','disputed')),
  login_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint identity_links_subject_unique unique (issuer, provider_sub),
  constraint identity_links_login_verified check (not login_enabled or status = 'verified')
);
grant select, insert, update on public.identity_links to rout_app;
alter table public.identity_links enable row level security;
create policy identity_links_owner on public.identity_links to rout_app
using (user_id::text = current_setting('rout.auth_user_id', true))
with check (user_id::text = current_setting('rout.auth_user_id', true));
create index identity_links_user_idx on public.identity_links(user_id);

create table public.identity_link_events (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.identity_links(id) on delete cascade,
  user_id uuid not null,
  event text not null check (event in ('linked','reverified','login_enabled','login_disabled','revoked','disputed')),
  actor text not null,
  ip_hash bytea,
  ua_hash bytea,
  prev_hash bytea,
  event_hash bytea not null check (octet_length(event_hash) = 32),
  created_at timestamptz not null default now()
);
grant select, insert on public.identity_link_events to rout_app;
grant usage, select on sequence public.identity_link_events_id_seq to rout_app;
alter table public.identity_link_events enable row level security;
create policy identity_link_events_owner on public.identity_link_events to rout_app
using (user_id::text = current_setting('rout.auth_user_id', true))
with check (user_id::text = current_setting('rout.auth_user_id', true));
create index identity_link_events_chain_idx on public.identity_link_events(link_id, id desc);

create function public.identity_event_chain() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare owner_id uuid;
begin
  if TG_OP <> 'INSERT' then raise exception 'identity_events_append_only'; end if;
  -- Serialize the chain on the identity row, including the first event.
  select user_id into owner_id from public.identity_links where id = NEW.link_id for update;
  if owner_id is null or owner_id <> NEW.user_id then raise exception 'identity_event_owner_mismatch'; end if;
  select event_hash into NEW.prev_hash from public.identity_link_events where link_id = NEW.link_id order by id desc limit 1;
  NEW.event_hash := public.digest(coalesce(NEW.prev_hash, ''::bytea) || convert_to(
    jsonb_build_object('link_id',NEW.link_id,'user_id',NEW.user_id,'event',NEW.event,'actor',NEW.actor,
      'ip_hash',encode(NEW.ip_hash,'hex'),'ua_hash',encode(NEW.ua_hash,'hex'),
      'created_at',to_char(NEW.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,'UTF8'),'sha256');
  return NEW;
end $$;
revoke all on function public.identity_event_chain() from public;
create trigger identity_events_append_only before insert or update or delete on public.identity_link_events
for each row execute function public.identity_event_chain();

-- Identity ownership cannot be reassigned by generic upsert/merge paths.
create function public.identity_owner_immutable() returns trigger language plpgsql as $$
begin
  if NEW.user_id <> OLD.user_id or NEW.issuer <> OLD.issuer or NEW.provider_sub <> OLD.provider_sub then
    raise exception 'identity_owner_immutable';
  end if;
  return NEW;
end $$;
revoke all on function public.identity_owner_immutable() from public;
create trigger identity_links_owner_immutable before update on public.identity_links
for each row execute function public.identity_owner_immutable();