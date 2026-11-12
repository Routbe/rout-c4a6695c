-- Forward-only hardening; apply after reviewed 0198/0199/0200.
-- PostgreSQL has no automatic TTL index: expires_at is indexed for cleanup,
-- while every verification rejects expired nonces regardless of cleanup timing.
create table public.used_nonces (
  nonce text primary key check (nonce ~ '^[A-Za-z0-9_-]{22}$'),
  expires_at timestamptz not null
);
revoke all on public.used_nonces from public, rout_app;
alter table public.used_nonces enable row level security;
create index used_nonces_expiry_idx on public.used_nonces(expires_at);
insert into public.used_nonces select nonce, expires_at from public.card_token_uses
  where length(nonce) = 22 on conflict do nothing;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  event text not null check (event in ('qr_verified', 'qr_replayed', 'qr_expired', 'hw_verified', 'hw_rejected')),
  occurred_at timestamptz not null default now()
);
revoke all on public.audit_logs from public, rout_app;
alter table public.audit_logs enable row level security;
-- Deliberately no bearer token, nonce or personal identifier in public-scan logs.
create or replace function public.rout_card_token_use(n text, exp timestamptz) returns boolean
language plpgsql volatile security definer set search_path to 'public' as $$
declare inserted integer;
begin
  if n is null or n !~ '^[A-Za-z0-9_-]{22}$' or exp is null or exp <= now()
     or exp > now() + interval '60 seconds' then
    insert into public.audit_logs(event) values ('qr_expired');
    return false;
  end if;
  delete from public.used_nonces where expires_at < now() - interval '5 minutes';
  insert into public.used_nonces(nonce, expires_at) values(n, exp) on conflict do nothing;
  get diagnostics inserted = row_count;
  insert into public.audit_logs(event) values(case when inserted = 1 then 'qr_verified' else 'qr_replayed' end);
  return inserted = 1;
end $$;
revoke all on function public.rout_card_token_use(text, timestamptz) from public;
grant execute on function public.rout_card_token_use(text, timestamptz) to rout_app;

create table public.wallet_passes (
  object_id text primary key check (object_id ~ '^[0-9]+\.[A-Za-z0-9._-]+$'),
  user_id uuid not null references public.users(id) on delete cascade,
  card_serial text not null,
  sync_status text not null default 'pending' check (sync_status in ('pending','synced','failed')),
  updated_at timestamptz not null default now()
);
grant select on public.wallet_passes to rout_app;
alter table public.wallet_passes enable row level security;
create policy wallet_passes_read_own on public.wallet_passes for select to rout_app
using (user_id = public.rout_current_user_id());
-- No browser writes, sync worker or callbacks implied by this source schema.
-- user_sessions already exists: preserve the established authentication contract.

create or replace function public.rout_card_status_by_serial(s text) returns text
language sql stable security definer set search_path to 'public' as $$
  select case
    when exists(select 1 from public.card_freezes where serial = s) then 'frozen'
    when exists(select 1 from public.physical_keys where card_serial = s and status <> 'active') then 'frozen'
    else 'active' end
$$;
revoke all on function public.rout_card_status_by_serial(text) from public;
grant execute on function public.rout_card_status_by_serial(text) to rout_app;

create function public.rout_card_status_by_hardware(hid uuid) returns text
language sql stable security definer set search_path to 'public' as $$
  select case when k.status = 'active' and k.public_key is not null
    and k.key_alg in ('Ed25519','P-256') and k.card_serial is not null
    and public.rout_card_status_by_serial(k.card_serial) = 'active'
    then 'active' else 'frozen' end
  from public.physical_keys k where k.hardware_id = hid
$$;
revoke all on function public.rout_card_status_by_hardware(uuid) from public;
grant execute on function public.rout_card_status_by_hardware(uuid) to rout_app;

create or replace function public.rout_hw_issue_challenge(hid uuid, nh text) returns boolean
language plpgsql volatile security definer set search_path to 'public' as $$
begin
  if public.rout_card_status_by_hardware(hid) is distinct from 'active'
     or nh is null or nh !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from public.hardware_challenges where expires_at < now();
  insert into public.hardware_challenges(nonce_hash, hardware_id, expires_at)
    values(nh, hid, now() + interval '30 seconds') on conflict do nothing;
  return found;
end $$;
revoke all on function public.rout_hw_issue_challenge(uuid, text) from public;
grant execute on function public.rout_hw_issue_challenge(uuid, text) to rout_app;

create or replace function public.rout_hw_consume_challenge(hid uuid, nh text)
returns table(public_key text, key_alg text, status text)
language plpgsql volatile security definer set search_path to 'public' as $$
begin
  if public.rout_card_status_by_hardware(hid) is distinct from 'active' then return; end if;
  delete from public.hardware_challenges c where c.nonce_hash = nh and c.hardware_id = hid and c.expires_at > now();
  if not found then return; end if;
  return query select k.public_key, k.key_alg, k.status from public.physical_keys k
    where k.hardware_id = hid and k.status = 'active';
end $$;
revoke all on function public.rout_hw_consume_challenge(uuid, text) from public;
grant execute on function public.rout_hw_consume_challenge(uuid, text) to rout_app;