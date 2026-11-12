-- 0224: NFC card recovery gate (Sovereign Identity, recovery factor "nfc_card").
--
-- A member who lost their passkey cannot pass the vault's passkey step-up, so the
-- card factor needs its own door. That door opens only for a live NTAG 424 DNA
-- SUN tap whose AES-CMAC the server verified, and it is locked after three
-- failed taps in ten minutes, per card AND per account.
--
-- Why two calls instead of one. The CMAC can only be checked with the card's
-- SDM keys, which exist in plaintext only on the server (sdm_ envelope, opened
-- with ROUT_VAULT_KEK, db/0222). The database never sees them, so it cannot run
-- the CMAC itself. It enforces everything around it instead:
--
--   retrieve_sdm_for_recovery(card, picc_data, cmac)
--       lockout check on the database clock, then records the attempt as
--       PENDING (it counts as a failure until confirmed) and returns the sealed
--       sdm_ envelope plus the last accepted counter. Locked, unknown, revoked
--       and malformed requests return granted = false and release nothing.
--   confirm_sdm_recovery(attempt, picc_data, cmac, verified, read_counter)
--       closes the attempt: only once, within 60 s, for the same tap bytes, and
--       only with a counter strictly above the last accepted one (atomic, so a
--       replayed tap URL can never succeed twice). Anything else is a failure.
--
-- An attempt the server never confirms (crash, timeout, tampering) stays a
-- failure: a caller cannot avoid the counter by not reporting back.
-- Trust boundary, stated plainly: the server remains the CMAC verifier; the
-- database bounds how often it may ask, binds the answer to one tap and makes
-- replay impossible. Known trade-off of any lockout: someone who knows a card
-- id can keep that card locked by sending garbage taps (card ids are 122-bit
-- random and only printed in the card's own tap URL).

create table vault_enclave.sdm_cards (
  card_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete restrict,
  sdm_ref text not null unique references vault_enclave.opaque_tokens(token_ref) on delete restrict,
  last_counter integer,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  constraint sdm_cards_ref_kind check (left(sdm_ref, 4) = 'sdm_'),
  constraint sdm_cards_counter_range check (last_counter is null or last_counter between 0 and 16777214)
);
create index sdm_cards_owner_idx on vault_enclave.sdm_cards (owner_user_id);

create table vault_enclave.sdm_recovery_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  card_id uuid not null references vault_enclave.sdm_cards(card_id) on delete restrict,
  owner_user_id uuid not null,
  tap_digest bytea not null,
  started_at timestamptz not null,
  outcome text not null default 'pending',
  closed_at timestamptz,
  read_counter integer,
  constraint sdm_attempts_outcome check (outcome in ('pending', 'verified', 'failed')),
  constraint sdm_attempts_digest_len check (octet_length(tap_digest) = 32)
);
create index sdm_attempts_card_idx on vault_enclave.sdm_recovery_attempts (card_id, started_at);
create index sdm_attempts_owner_idx on vault_enclave.sdm_recovery_attempts (owner_user_id, started_at);

revoke all on table vault_enclave.sdm_cards from public, rout_app;
revoke all on table vault_enclave.sdm_recovery_attempts from public, rout_app;
alter table vault_enclave.sdm_cards enable row level security;
alter table vault_enclave.sdm_recovery_attempts enable row level security;

alter table vault_enclave.audit_logs drop constraint audit_logs_action_check;
alter table vault_enclave.audit_logs add constraint audit_logs_action_check
  check (action in ('step_up_register', 'token_store', 'token_retrieve', 'server_key_register',
                    'sdm_card_register', 'sdm_recovery_retrieve', 'sdm_recovery_confirm'));

-- Failures in the sliding 10-minute window. Pending attempts count: an
-- unconfirmed tap is never free.
create function vault_enclave.sdm_failures(p_card uuid, p_owner uuid, p_now timestamptz)
returns table (card_failures int, owner_failures int)
language sql stable set search_path = pg_catalog as $$
  select
    (select count(*)::int from vault_enclave.sdm_recovery_attempts a
      where a.card_id = p_card and a.outcome <> 'verified' and a.started_at > p_now - interval '10 minutes'),
    (select count(*)::int from vault_enclave.sdm_recovery_attempts a
      where a.owner_user_id = p_owner and a.outcome <> 'verified' and a.started_at > p_now - interval '10 minutes')
$$;

-- ---------------------------------------------------------------- RPCs

-- The owner links one of their own sdm_ envelopes to a new card; the database
-- mints the card id that goes into the card's tap URL.
create function vault_enclave.register_sdm_card(p_sdm_ref text)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_caller uuid := vault_enclave.caller_user_id();
  v_ref text := case when p_sdm_ref ~ '^sdm_[0-9a-f]{64}$' then p_sdm_ref end;
  v_card uuid;
begin
  if v_caller is null then
    perform vault_enclave.append_audit(null, 'sdm_card_register', 'denied', 'no_caller', v_ref); return null;
  end if;
  if v_ref is null or not exists (
       select 1 from vault_enclave.opaque_tokens t where t.token_ref = v_ref and t.owner_user_id = v_caller and t.token_type = 'sdm') then
    perform vault_enclave.append_audit(v_caller, 'sdm_card_register', 'denied', 'not_owned_sdm', v_ref); return null;
  end if;
  if exists (select 1 from vault_enclave.sdm_cards c where c.sdm_ref = v_ref) then
    perform vault_enclave.append_audit(v_caller, 'sdm_card_register', 'denied', 'already_linked', v_ref); return null;
  end if;
  insert into vault_enclave.sdm_cards (owner_user_id, sdm_ref) values (v_caller, v_ref) returning card_id into v_card;
  perform vault_enclave.append_audit(v_caller, 'sdm_card_register', 'granted', 'ok', v_ref);
  return v_card;
end $$;

-- Pre-authentication (no session needed): the card id comes from the tap URL.
create function vault_enclave.retrieve_sdm_for_recovery(p_card_id uuid, p_picc_data bytea, p_cmac bytea)
returns table (granted boolean, attempt_id uuid, owner_user_id uuid, sdm_ref text, encrypted_payload bytea, last_counter integer)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_card vault_enclave.sdm_cards%rowtype;
  v_fail record;
  v_attempt uuid;
  v_payload bytea;
begin
  select * into v_card from vault_enclave.sdm_cards c where c.card_id = p_card_id for update;
  if not found or v_card.revoked_at is not null then
    perform vault_enclave.append_audit(null, 'sdm_recovery_retrieve', 'denied', case when found then 'card_revoked' else 'unknown_card' end, v_card.sdm_ref);
    return query select false, null::uuid, null::uuid, null::text, null::bytea, null::integer; return;
  end if;
  -- Serialise all of this member's recovery attempts, so parallel taps cannot
  -- all pass the lockout check before any of them is counted.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_card.owner_user_id::text, 7421003224));
  -- Closed attempts older than a day no longer affect the lockout; the audit chain keeps the history.
  delete from vault_enclave.sdm_recovery_attempts a where a.owner_user_id = v_card.owner_user_id and a.started_at < v_now - interval '1 day';
  select * into v_fail from vault_enclave.sdm_failures(v_card.card_id, v_card.owner_user_id, v_now);
  if v_fail.card_failures >= 3 or v_fail.owner_failures >= 3 then
    perform vault_enclave.append_audit(v_card.owner_user_id, 'sdm_recovery_retrieve', 'denied',
      case when v_fail.card_failures >= 3 then 'card_locked' else 'account_locked' end, v_card.sdm_ref);
    return query select false, null::uuid, null::uuid, null::text, null::bytea, null::integer; return;
  end if;
  if p_picc_data is null or p_cmac is null or octet_length(p_picc_data) <> 16 or octet_length(p_cmac) <> 8 then
    insert into vault_enclave.sdm_recovery_attempts (card_id, owner_user_id, tap_digest, started_at, outcome, closed_at)
    values (v_card.card_id, v_card.owner_user_id, pg_catalog.sha256(coalesce(p_picc_data, ''::bytea) || coalesce(p_cmac, ''::bytea)), v_now, 'failed', v_now);
    perform vault_enclave.append_audit(v_card.owner_user_id, 'sdm_recovery_retrieve', 'denied', 'malformed_tap', v_card.sdm_ref);
    return query select false, null::uuid, null::uuid, null::text, null::bytea, null::integer; return;
  end if;
  select t.encrypted_payload into v_payload from vault_enclave.opaque_tokens t
   where t.token_ref = v_card.sdm_ref and t.owner_user_id = v_card.owner_user_id and t.token_type = 'sdm';
  if not found then
    perform vault_enclave.append_audit(v_card.owner_user_id, 'sdm_recovery_retrieve', 'denied', 'envelope_missing', v_card.sdm_ref);
    return query select false, null::uuid, null::uuid, null::text, null::bytea, null::integer; return;
  end if;
  insert into vault_enclave.sdm_recovery_attempts (card_id, owner_user_id, tap_digest, started_at)
  values (v_card.card_id, v_card.owner_user_id, pg_catalog.sha256(p_picc_data || p_cmac), v_now)
  returning sdm_recovery_attempts.attempt_id into v_attempt;
  perform vault_enclave.append_audit(v_card.owner_user_id, 'sdm_recovery_retrieve', 'granted', 'pending', v_card.sdm_ref);
  return query select true, v_attempt, v_card.owner_user_id, v_card.sdm_ref, v_payload, v_card.last_counter;
end $$;

create function vault_enclave.confirm_sdm_recovery(
  p_attempt_id uuid, p_picc_data bytea, p_cmac bytea, p_verified boolean, p_read_counter integer)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_attempt vault_enclave.sdm_recovery_attempts%rowtype;
  v_ref text;
  v_rows int;
begin
  select * into v_attempt from vault_enclave.sdm_recovery_attempts a where a.attempt_id = p_attempt_id for update;
  if not found or v_attempt.outcome <> 'pending' then
    perform vault_enclave.append_audit(null, 'sdm_recovery_confirm', 'denied', 'attempt_not_pending', null);
    return false;
  end if;
  select c.sdm_ref into v_ref from vault_enclave.sdm_cards c where c.card_id = v_attempt.card_id;
  if p_verified is distinct from true
     or v_now - v_attempt.started_at > interval '60 seconds'
     or p_picc_data is null or p_cmac is null
     or pg_catalog.sha256(p_picc_data || p_cmac) <> v_attempt.tap_digest
     or p_read_counter is null or p_read_counter not between 0 and 16777214 then
    update vault_enclave.sdm_recovery_attempts set outcome = 'failed', closed_at = v_now where attempt_id = v_attempt.attempt_id;
    perform vault_enclave.append_audit(v_attempt.owner_user_id, 'sdm_recovery_confirm', 'denied',
      case when p_verified is distinct from true then 'cmac_invalid'
           when v_now - v_attempt.started_at > interval '60 seconds' then 'attempt_expired'
           when p_read_counter is null or p_read_counter not between 0 and 16777214 then 'bad_counter'
           else 'tap_mismatch' end, v_ref);
    return false;
  end if;
  -- Strictly increasing counter, atomically: the same tap URL never works twice.
  update vault_enclave.sdm_cards c set last_counter = p_read_counter
   where c.card_id = v_attempt.card_id and c.revoked_at is null
     and (c.last_counter is null or c.last_counter < p_read_counter);
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    update vault_enclave.sdm_recovery_attempts set outcome = 'failed', closed_at = v_now where attempt_id = v_attempt.attempt_id;
    perform vault_enclave.append_audit(v_attempt.owner_user_id, 'sdm_recovery_confirm', 'denied', 'replayed', v_ref);
    return false;
  end if;
  update vault_enclave.sdm_recovery_attempts
     set outcome = 'verified', closed_at = v_now, read_counter = p_read_counter
   where attempt_id = v_attempt.attempt_id;
  perform vault_enclave.append_audit(v_attempt.owner_user_id, 'sdm_recovery_confirm', 'granted', 'ok', v_ref);
  return true;
end $$;

revoke all on function vault_enclave.sdm_failures(uuid, uuid, timestamptz) from public, rout_app;
revoke all on function vault_enclave.register_sdm_card(text) from public, rout_app;
revoke all on function vault_enclave.retrieve_sdm_for_recovery(uuid, bytea, bytea) from public, rout_app;
revoke all on function vault_enclave.confirm_sdm_recovery(uuid, bytea, bytea, boolean, integer) from public, rout_app;
grant execute on function vault_enclave.register_sdm_card(text) to rout_app;
grant execute on function vault_enclave.retrieve_sdm_for_recovery(uuid, bytea, bytea) to rout_app;
grant execute on function vault_enclave.confirm_sdm_recovery(uuid, bytea, bytea, boolean, integer) to rout_app;
