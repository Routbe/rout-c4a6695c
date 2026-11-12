-- 0221: Vault enclave isolation (Sovereign Identity, layer 1).
--
-- Raw identifiers (IBAN, national register numbers, private keys) never live in
-- public tables. They are stored only as client-sealed ciphertext in the
-- vault_enclave schema and addressed by opaque references (vtk_/vcc_/mpc_/sdm_,
-- see src/lib/vault/token-boundary.ts). rout_app gets no table privileges at
-- all; it may only call three SECURITY DEFINER functions:
--
--   register_step_up_proof  records a passkey (WebAuthn) step-up the server just
--                           verified, stamped with the DATABASE clock.
--   store_opaque_token      stores a sealed envelope for the caller, returns its ref.
--   retrieve_opaque_token   returns the envelope only with p_step_up_verified = true
--                           AND a registered, unused passkey proof of the same
--                           member at most 300 s old (DB clock). The proof is spent.
--
-- The caller is always read from the transaction context set by the server
-- (rout.current_user_id, see src/lib/db-context.ts), never from a parameter.
-- Denials do not raise: they return granted = false so the audit row commits.
-- Every call (granted or denied) appends one row to the hash-chained,
-- append-only vault_enclave.audit_logs.
--
-- Trust boundary, stated plainly: the database cannot verify a WebAuthn
-- signature itself, so the server remains the verifier of the passkey. The
-- database enforces what it can prove: caller binding, freshness on its own
-- clock, single use, ownership, payload shape and an immutable audit chain.
-- The table owner can still disable triggers; external checkpoints of the
-- chain head (verify_audit_chain) are the control for that.
--
-- Envelope format enforced here (produced by crypto-enclave/pqc-envelope.ts):
-- magic 'RVE1' (0x52564531) followed by the hybrid ML-KEM-1024 + X25519 body;
-- minimum 1600 bytes (ML-KEM-1024 ciphertext 1568 + X25519 public key 32),
-- maximum 64 KiB.

create schema if not exists vault_enclave;
revoke all on schema vault_enclave from public;
grant usage on schema vault_enclave to rout_app;

-- ---------------------------------------------------------------- tables

create table vault_enclave.opaque_tokens (
  id uuid primary key default gen_random_uuid(),
  token_ref text not null unique,
  token_type text not null,
  owner_user_id uuid not null references public.users(id) on delete restrict,
  encrypted_payload bytea not null,
  created_at timestamptz not null default now(),
  constraint opaque_tokens_type_check check (token_type in ('vtk', 'vcc', 'mpc', 'sdm')),
  constraint opaque_tokens_ref_format check (token_ref ~ '^(vtk|vcc|mpc|sdm)_[0-9a-f]{64}$'),
  constraint opaque_tokens_ref_matches_type check (left(token_ref, 3) = token_type),
  constraint opaque_tokens_payload_envelope check (
    octet_length(encrypted_payload) between 1600 and 65536
    and substring(encrypted_payload from 1 for 4) = '\x52564531'::bytea)
);
create index opaque_tokens_owner_idx on vault_enclave.opaque_tokens (owner_user_id);

create table vault_enclave.step_up_proofs (
  proof_id uuid primary key,
  user_id uuid not null,
  method text not null,
  verified_at timestamptz not null,
  consumed_at timestamptz,
  constraint step_up_proofs_method_check check (method = 'passkey')
);
create index step_up_proofs_user_idx on vault_enclave.step_up_proofs (user_id, verified_at);

create table vault_enclave.audit_logs (
  seq bigint generated always as identity primary key,
  occurred_at timestamptz not null,
  actor_user_id uuid,
  action text not null,
  outcome text not null,
  reason text not null,
  token_ref text,
  prev_hash bytea not null unique,
  entry_hash bytea not null unique,
  constraint audit_logs_action_check check (action in ('step_up_register', 'token_store', 'token_retrieve')),
  constraint audit_logs_outcome_check check (outcome in ('granted', 'denied')),
  constraint audit_logs_hash_len check (octet_length(prev_hash) = 32 and octet_length(entry_hash) = 32)
);

-- Nobody but the owner touches these tables directly.
REVOKE ALL ON TABLE vault_enclave.opaque_tokens FROM PUBLIC, rout_app;
revoke all on table vault_enclave.step_up_proofs from public, rout_app;
revoke all on table vault_enclave.audit_logs from public, rout_app;
revoke all on sequence vault_enclave.audit_logs_seq_seq from public, rout_app;
alter table vault_enclave.opaque_tokens enable row level security;
alter table vault_enclave.step_up_proofs enable row level security;
alter table vault_enclave.audit_logs enable row level security;

-- ---------------------------------------------------------------- audit chain

create function vault_enclave.audit_entry_hash(
  p_prev bytea, p_at timestamptz, p_actor uuid, p_action text, p_outcome text, p_reason text, p_ref text)
returns bytea language sql immutable set search_path = pg_catalog as $$
  select pg_catalog.sha256(p_prev || pg_catalog.convert_to(pg_catalog.concat_ws(chr(31),
    pg_catalog.to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(p_actor::text, '-'), p_action, p_outcome, p_reason, coalesce(p_ref, '-')), 'UTF8'))
$$;

create function vault_enclave.append_audit(
  p_actor uuid, p_action text, p_outcome text, p_reason text, p_ref text)
returns void language plpgsql set search_path = pg_catalog as $$
declare
  v_prev bytea;
  v_at timestamptz := pg_catalog.clock_timestamp();
begin
  -- One writer at a time keeps the chain linear (prev_hash is unique: no forks).
  perform pg_catalog.pg_advisory_xact_lock(7421003221);
  select a.entry_hash into v_prev from vault_enclave.audit_logs a order by a.seq desc limit 1;
  v_prev := coalesce(v_prev, pg_catalog.decode(pg_catalog.repeat('00', 32), 'hex'));
  insert into vault_enclave.audit_logs (occurred_at, actor_user_id, action, outcome, reason, token_ref, prev_hash, entry_hash)
  values (v_at, p_actor, p_action, p_outcome, p_reason, p_ref, v_prev,
          vault_enclave.audit_entry_hash(v_prev, v_at, p_actor, p_action, p_outcome, p_reason, p_ref));
end $$;

create function vault_enclave.audit_logs_immutable() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'vault_audit_immutable' using errcode = '42501';
end $$;

create trigger audit_logs_no_update before update or delete on vault_enclave.audit_logs
  for each row execute function vault_enclave.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on vault_enclave.audit_logs
  for each statement execute function vault_enclave.audit_logs_immutable();

-- Recomputes every link; false on the first broken or reordered entry.
create function vault_enclave.verify_audit_chain() returns boolean
language plpgsql stable set search_path = pg_catalog as $$
declare
  r record;
  v_prev bytea := pg_catalog.decode(pg_catalog.repeat('00', 32), 'hex');
begin
  for r in select * from vault_enclave.audit_logs order by seq loop
    if r.prev_hash <> v_prev or r.entry_hash <> vault_enclave.audit_entry_hash(
         r.prev_hash, r.occurred_at, r.actor_user_id, r.action, r.outcome, r.reason, r.token_ref) then
      return false;
    end if;
    v_prev := r.entry_hash;
  end loop;
  return true;
end $$;

-- ---------------------------------------------------------------- caller

create function vault_enclave.caller_user_id() returns uuid
language plpgsql stable set search_path = pg_catalog as $$
declare v text := pg_catalog.current_setting('rout.current_user_id', true);
begin
  if v is null or v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return v::uuid;
end $$;

-- ---------------------------------------------------------------- RPCs

create function vault_enclave.register_step_up_proof(p_proof_id uuid, p_method text)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare v_caller uuid := vault_enclave.caller_user_id();
begin
  if v_caller is null then
    perform vault_enclave.append_audit(null, 'step_up_register', 'denied', 'no_caller', null); return false;
  end if;
  if p_method is distinct from 'passkey' then
    perform vault_enclave.append_audit(v_caller, 'step_up_register', 'denied', 'method_not_passkey', null); return false;
  end if;
  if p_proof_id is null or exists (select 1 from vault_enclave.step_up_proofs s where s.proof_id = p_proof_id) then
    perform vault_enclave.append_audit(v_caller, 'step_up_register', 'denied', 'proof_reused', null); return false;
  end if;
  -- Spent and stale proofs are useless after 300 s; keep the table small.
  delete from vault_enclave.step_up_proofs s where s.verified_at < pg_catalog.clock_timestamp() - interval '1 hour';
  insert into vault_enclave.step_up_proofs (proof_id, user_id, method, verified_at)
  values (p_proof_id, v_caller, 'passkey', pg_catalog.clock_timestamp());
  perform vault_enclave.append_audit(v_caller, 'step_up_register', 'granted', 'ok', null);
  return true;
end $$;

create function vault_enclave.store_opaque_token(p_token_type text, p_encrypted_payload bytea)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_caller uuid := vault_enclave.caller_user_id();
  v_ref text;
begin
  if v_caller is null then
    perform vault_enclave.append_audit(null, 'token_store', 'denied', 'no_caller', null); return null;
  end if;
  if p_token_type is null or p_token_type not in ('vtk', 'vcc', 'mpc', 'sdm') then
    perform vault_enclave.append_audit(v_caller, 'token_store', 'denied', 'bad_type', null); return null;
  end if;
  if p_encrypted_payload is null or octet_length(p_encrypted_payload) not between 1600 and 65536
     or substring(p_encrypted_payload from 1 for 4) <> '\x52564531'::bytea then
    perform vault_enclave.append_audit(v_caller, 'token_store', 'denied', 'not_an_envelope', null); return null;
  end if;
  if not exists (select 1 from public.users u where u.id = v_caller) then
    perform vault_enclave.append_audit(v_caller, 'token_store', 'denied', 'unknown_member', null); return null;
  end if;
  -- 256 random bits from the database's CSPRNG; the caller never chooses a ref.
  v_ref := p_token_type || '_' || pg_catalog.encode(public.gen_random_bytes(32), 'hex');
  insert into vault_enclave.opaque_tokens (token_ref, token_type, owner_user_id, encrypted_payload)
  values (v_ref, p_token_type, v_caller, p_encrypted_payload);
  perform vault_enclave.append_audit(v_caller, 'token_store', 'granted', 'ok', v_ref);
  return v_ref;
end $$;

create function vault_enclave.retrieve_opaque_token(p_token_ref text, p_step_up_verified boolean, p_step_up_proof_id uuid)
returns table (granted boolean, token_type text, encrypted_payload bytea)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_caller uuid := vault_enclave.caller_user_id();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_proof vault_enclave.step_up_proofs%rowtype;
  v_token vault_enclave.opaque_tokens%rowtype;
  v_ref text := case when p_token_ref ~ '^(vtk|vcc|mpc|sdm)_[0-9a-f]{64}$' then p_token_ref end;
begin
  if v_caller is null then
    perform vault_enclave.append_audit(null, 'token_retrieve', 'denied', 'no_caller', v_ref);
    return query select false, null::text, null::bytea; return;
  end if;
  if v_ref is null then
    perform vault_enclave.append_audit(v_caller, 'token_retrieve', 'denied', 'malformed_ref', null);
    return query select false, null::text, null::bytea; return;
  end if;
  if p_step_up_verified is distinct from true then
    perform vault_enclave.append_audit(v_caller, 'token_retrieve', 'denied', 'step_up_missing', v_ref);
    return query select false, null::text, null::bytea; return;
  end if;
  select * into v_proof from vault_enclave.step_up_proofs s
   where s.proof_id = p_step_up_proof_id and s.user_id = v_caller for update;
  if not found then
    perform vault_enclave.append_audit(v_caller, 'token_retrieve', 'denied', 'proof_unknown', v_ref);
    return query select false, null::text, null::bytea; return;
  end if;
  if v_proof.consumed_at is not null then
    perform vault_enclave.append_audit(v_caller, 'token_retrieve', 'denied', 'proof_replayed', v_ref);
    return query select false, null::text, null::bytea; return;
  end if;
  if v_proof.method <> 'passkey' or v_now - v_proof.verified_at > interval '300 seconds'
     or v_proof.verified_at > v_now + interval '5 seconds' then
    perform vault_enclave.append_audit(v_caller, 'token_retrieve', 'denied', 'proof_expired', v_ref);
    return query select false, null::text, null::bytea; return;
  end if;
  -- Spend the proof before the lookup, so a valid proof can't probe many refs.
  update vault_enclave.step_up_proofs set consumed_at = v_now where proof_id = v_proof.proof_id;
  select * into v_token from vault_enclave.opaque_tokens t
   where t.token_ref = v_ref and t.owner_user_id = v_caller;
  if not found then
    perform vault_enclave.append_audit(v_caller, 'token_retrieve', 'denied', 'not_found', v_ref);
    return query select false, null::text, null::bytea; return;
  end if;
  perform vault_enclave.append_audit(v_caller, 'token_retrieve', 'granted', 'ok', v_ref);
  return query select true, v_token.token_type, v_token.encrypted_payload;
end $$;

-- PostgreSQL grants EXECUTE to PUBLIC by default: take it away everywhere,
-- then hand rout_app exactly the three entry points.
revoke all on all functions in schema vault_enclave from public, rout_app;
grant execute on function vault_enclave.register_step_up_proof(uuid, text) to rout_app;
grant execute on function vault_enclave.store_opaque_token(text, bytea) to rout_app;
grant execute on function vault_enclave.retrieve_opaque_token(text, boolean, uuid) to rout_app;
