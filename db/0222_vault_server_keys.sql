-- 0222 — Server vault key ring for vtk_ / sdm_ (owner decision: Master KEK in
-- ROUT_VAULT_KEK, AES-256-GCM).
--
-- vtk_ and sdm_ envelopes (RVE1) are sealed to the server vault's ML-KEM-1024 +
-- X25519 recipient key. Its 32-byte secret seed is stored here ONLY wrapped with
-- AES-256-GCM under a key derived from ROUT_VAULT_KEK, which lives in the server
-- environment and never in the database. The database alone can therefore not
-- open a single vtk_ / sdm_ envelope, and the environment alone holds no data.
--
-- rout_app may read wrapped keys and register the first active key; it can
-- never retire, replace or delete one (rotation is an owner operation). A key
-- registered without the KEK is useless: the server refuses any wrap that does
-- not authenticate under the KEK, so a forged registration fails closed.

create table vault_enclave.server_keys (
  kid bytea primary key,
  public_key bytea not null,
  wrapped_seed bytea not null,
  kek_id bytea not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retired_at timestamptz,
  constraint server_keys_kid_len check (octet_length(kid) = 16),
  constraint server_keys_public_key_len check (octet_length(public_key) = 1600),
  -- "RVK1" magic(4) || kek id(16) || nonce(12) || AES-256-GCM(seed 32) + tag(16)
  constraint server_keys_wrap_len check (octet_length(wrapped_seed) = 80),
  constraint server_keys_wrap_magic check (substring(wrapped_seed from 1 for 4) = '\x52564b31'::bytea),
  constraint server_keys_kek_len check (octet_length(kek_id) = 16),
  constraint server_keys_kid_matches check (
    kid = substring(pg_catalog.sha256(pg_catalog.convert_to('rout.rve1.kid', 'UTF8') || public_key) from 1 for 16))
);
-- Exactly one key seals new envelopes; retired keys stay readable for old ones.
create unique index server_keys_one_active on vault_enclave.server_keys ((true)) where retired_at is null;
revoke all on table vault_enclave.server_keys from public, rout_app;
alter table vault_enclave.server_keys enable row level security;

-- Keys are never deleted and never change, except being retired once.
create function vault_enclave.server_keys_guard() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' then raise exception 'vault_enclave.server_keys is append-only'; end if;
  if old.retired_at is not null or new.retired_at is null
     or (new.kid, new.public_key, new.wrapped_seed, new.kek_id, new.created_at)
        is distinct from (old.kid, old.public_key, old.wrapped_seed, old.kek_id, old.created_at) then
    raise exception 'vault_enclave.server_keys rows can only be retired once';
  end if;
  return new;
end $$;
create trigger server_keys_guard before update or delete on vault_enclave.server_keys
  for each row execute function vault_enclave.server_keys_guard();
create trigger server_keys_no_truncate before truncate on vault_enclave.server_keys
  for each statement execute function vault_enclave.audit_logs_immutable();

alter table vault_enclave.audit_logs drop constraint audit_logs_action_check;
alter table vault_enclave.audit_logs add constraint audit_logs_action_check
  check (action in ('step_up_register', 'token_store', 'token_retrieve', 'server_key_register'));

-- ---------------------------------------------------------------- RPCs

create function vault_enclave.server_key_active()
returns table (kid bytea, public_key bytea, wrapped_seed bytea, kek_id bytea)
language sql stable security definer set search_path = pg_catalog as $$
  select k.kid, k.public_key, k.wrapped_seed, k.kek_id from vault_enclave.server_keys k where k.retired_at is null
$$;

-- Any key, retired or not: old envelopes must stay openable after a rotation.
create function vault_enclave.server_key_get(p_kid bytea)
returns table (kid bytea, public_key bytea, wrapped_seed bytea, kek_id bytea)
language sql stable security definer set search_path = pg_catalog as $$
  select k.kid, k.public_key, k.wrapped_seed, k.kek_id from vault_enclave.server_keys k where k.kid = p_kid
$$;

-- First writer wins; a second active key is refused (rotation is owner-only).
create function vault_enclave.register_server_key(p_kid bytea, p_public_key bytea, p_wrapped_seed bytea, p_kek_id bytea)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_caller uuid := vault_enclave.caller_user_id();
  v_rows int;
begin
  if v_caller is null then
    perform vault_enclave.append_audit(null, 'server_key_register', 'denied', 'no_caller', null); return false;
  end if;
  begin
    insert into vault_enclave.server_keys (kid, public_key, wrapped_seed, kek_id)
    values (p_kid, p_public_key, p_wrapped_seed, p_kek_id)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
  exception when check_violation or not_null_violation then
    perform vault_enclave.append_audit(v_caller, 'server_key_register', 'denied', 'malformed', null); return false;
  end;
  if v_rows = 0 then
    perform vault_enclave.append_audit(v_caller, 'server_key_register', 'denied', 'active_key_exists', null); return false;
  end if;
  perform vault_enclave.append_audit(v_caller, 'server_key_register', 'granted', 'ok', null);
  return true;
end $$;

revoke all on function vault_enclave.server_keys_guard() from public, rout_app;
revoke all on function vault_enclave.server_key_active() from public, rout_app;
revoke all on function vault_enclave.server_key_get(bytea) from public, rout_app;
revoke all on function vault_enclave.register_server_key(bytea, bytea, bytea, bytea) from public, rout_app;
grant execute on function vault_enclave.server_key_active() to rout_app;
grant execute on function vault_enclave.server_key_get(bytea) to rout_app;
grant execute on function vault_enclave.register_server_key(bytea, bytea, bytea, bytea) to rout_app;
