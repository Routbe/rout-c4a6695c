-- 0199: ROUT Card CMF designs, single-use secure QR tokens, physical keys
-- (NFC/RFID/secure element) with challenge-response and an audit log.
-- Run as the database owner (not rout_app): rout_app must own no tables.
-- Anonymous paths (scanners, terminals) only reach security-definer functions
-- that return the minimum: a boolean, or a public key and a status.

-- CMF production payload (material, colours, text positions) per card serial.
create table if not exists public.card_designs (
  serial text primary key check (serial ~ '^[\w.-]{8,128}$'),
  user_id uuid not null,
  cmf jsonb not null check (jsonb_typeof(cmf) = 'object' and octet_length(cmf::text) < 8192),
  updated_at timestamptz not null default now()
);
alter table public.card_designs enable row level security;
drop policy if exists card_designs_own on public.card_designs;
create policy card_designs_own on public.card_designs for all
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());

create or replace function public.rout_card_design(s text) returns jsonb
  language sql stable security definer set search_path to 'public'
as $$ select cmf from public.card_designs where serial = s $$;
revoke all on function public.rout_card_design(text) from public;

-- Single-use nonces for the secure QR (replay protection), kept until expiry.
create table if not exists public.card_token_uses (
  nonce text primary key check (nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  expires_at timestamptz not null
);
alter table public.card_token_uses enable row level security;

create or replace function public.rout_card_token_use(n text, exp timestamptz) returns boolean
  language plpgsql volatile security definer set search_path to 'public'
as $$
declare ok boolean;
begin
  delete from public.card_token_uses where expires_at < now() - interval '5 minutes';
  insert into public.card_token_uses (nonce, expires_at) values (n, exp)
    on conflict (nonce) do nothing;
  get diagnostics ok = row_count;
  return ok;
end $$;
revoke all on function public.rout_card_token_use(text, timestamptz) from public;

-- Physical keys: one member can hold several cards or wearables.
create table if not exists public.physical_keys (
  hardware_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_serial text,
  label text check (label is null or char_length(label) <= 40),
  nfc_uid text unique check (nfc_uid is null or nfc_uid ~ '^[0-9A-F:]{8,40}$'),
  rfid_legacy_uid text unique check (rfid_legacy_uid is null or rfid_legacy_uid ~ '^[0-9A-F]{8,20}$'),
  public_key text check (public_key is null or public_key ~ '^[A-Za-z0-9_-]{40,200}$'),
  key_alg text check (key_alg is null or key_alg in ('Ed25519', 'P-256')),
  status text not null default 'pending' check (status in ('pending', 'active', 'frozen', 'revoked')),
  issued_at timestamptz not null default now(),
  last_scanned_at timestamptz
);
create index if not exists physical_keys_user_idx on public.physical_keys (user_id);
alter table public.physical_keys enable row level security;
drop policy if exists physical_keys_select_own on public.physical_keys;
create policy physical_keys_select_own on public.physical_keys for select
  using (user_id = public.rout_current_user_id());
drop policy if exists physical_keys_insert_own on public.physical_keys;
create policy physical_keys_insert_own on public.physical_keys for insert
  with check (user_id = public.rout_current_user_id() and status = 'pending');
drop policy if exists physical_keys_update_own on public.physical_keys;
create policy physical_keys_update_own on public.physical_keys for update
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());

-- Audit log survives key deletion and account removal (no foreign key on purpose).
create table if not exists public.physical_key_events (
  id bigint generated always as identity primary key,
  hardware_id uuid not null,
  user_id uuid,
  event text not null check (event in ('provisioned', 'activated', 'frozen', 'unfrozen', 'revoked', 'verified', 'rejected')),
  at timestamptz not null default now()
);
alter table public.physical_key_events enable row level security;
drop policy if exists physical_key_events_select_own on public.physical_key_events;
create policy physical_key_events_select_own on public.physical_key_events for select
  using (user_id = public.rout_current_user_id());

create or replace function public.rout_physical_key_audit() returns trigger
  language plpgsql security definer set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.physical_key_events (hardware_id, user_id, event) values (new.hardware_id, new.user_id, 'provisioned');
  elsif new.status is distinct from old.status then
    insert into public.physical_key_events (hardware_id, user_id, event) values (
      new.hardware_id, new.user_id,
      case new.status when 'active' then (case old.status when 'frozen' then 'unfrozen' else 'activated' end)
                      when 'frozen' then 'frozen' else 'revoked' end);
  end if;
  -- A revoked key never comes back.
  if tg_op = 'UPDATE' and old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'revoked keys cannot be reactivated' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists physical_keys_audit on public.physical_keys;
create trigger physical_keys_audit after insert or update on public.physical_keys
  for each row execute function public.rout_physical_key_audit();

-- Challenge-response: a nonce lives 30 s and can be consumed once.
create table if not exists public.hardware_challenges (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  hardware_id uuid not null,
  expires_at timestamptz not null
);
alter table public.hardware_challenges enable row level security;

create or replace function public.rout_hw_issue_challenge(hid uuid, nh text) returns boolean
  language plpgsql volatile security definer set search_path to 'public'
as $$
begin
  delete from public.hardware_challenges where expires_at < now();
  if not exists (select 1 from public.physical_keys where hardware_id = hid and public_key is not null) then
    return false;
  end if;
  insert into public.hardware_challenges (nonce_hash, hardware_id, expires_at) values (nh, hid, now() + interval '30 seconds');
  return true;
end $$;
revoke all on function public.rout_hw_issue_challenge(uuid, text) from public;

create or replace function public.rout_hw_consume_challenge(hid uuid, nh text)
  returns table (public_key text, key_alg text, status text)
  language plpgsql volatile security definer set search_path to 'public'
as $$
begin
  delete from public.hardware_challenges c where c.nonce_hash = nh and c.hardware_id = hid and c.expires_at >= now();
  if not found then return; end if;
  return query select k.public_key, k.key_alg, k.status from public.physical_keys k where k.hardware_id = hid;
end $$;
revoke all on function public.rout_hw_consume_challenge(uuid, text) from public;

create or replace function public.rout_hw_record_scan(hid uuid, ok boolean) returns void
  language plpgsql volatile security definer set search_path to 'public'
as $$
begin
  update public.physical_keys set last_scanned_at = now() where hardware_id = hid and ok;
  insert into public.physical_key_events (hardware_id, user_id, event)
    select hid, k.user_id, case when ok then 'verified' else 'rejected' end from public.physical_keys k where k.hardware_id = hid;
end $$;
revoke all on function public.rout_hw_record_scan(uuid, boolean) from public;

-- Card-number lookup for MRZ scanners: frozen if the card or any linked key is frozen/revoked.
create or replace function public.rout_card_status_by_serial(s text) returns text
  language sql stable security definer set search_path to 'public'
as $$ select case
  when exists (select 1 from public.card_freezes where serial = s) then 'frozen'
  when exists (select 1 from public.physical_keys where card_serial = s and status in ('frozen', 'revoked')) then 'frozen'
  else 'active' end $$;
revoke all on function public.rout_card_status_by_serial(text) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.card_designs to rout_app;
    grant select, insert on public.physical_keys to rout_app;
    grant update (status, label, public_key, key_alg) on public.physical_keys to rout_app;
    grant select on public.physical_key_events to rout_app;
    revoke all on public.card_token_uses, public.hardware_challenges from rout_app;
    grant execute on function public.rout_card_design(text), public.rout_card_token_use(text, timestamptz),
      public.rout_hw_issue_challenge(uuid, text), public.rout_hw_consume_challenge(uuid, text),
      public.rout_hw_record_scan(uuid, boolean), public.rout_card_status_by_serial(text) to rout_app;
  end if;
end $$;
