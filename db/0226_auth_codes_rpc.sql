-- 0226: sign-in and 2FA codes only through database functions (0223 phase 2).
--
-- security_codes (e-mail/SMS step-up codes), phone_otp_codes (phone number
-- verification) and auth_tokens (retired pre-Better-Auth links, empty live)
-- lose every rout_app privilege and their free "rout_server" policy. The app
-- reaches them only through the SECURITY DEFINER functions below, which take
-- the member from the transaction context and enforce in the database:
-- one open code per member and purpose, the expiry, at most 5 wrong tries,
-- single use, and an issue cap (security codes 5 per 15 min per purpose; phone
-- codes 5 per hour per member and 3 per hour per number).
-- Codes arrive only as digests computed by the server; the database compares.
-- Better Auth (neon_auth.*) and OIDC tables are not touched here.

-- Admin check on the database side for the manual phone queue (same rule as 0195).
create or replace function public.rout_caller_is_admin()
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from public.user_roles r
                  where r.user_id = public.rout_current_user_id() and r.role::text = 'admin')
$$;

-- ---------------------------------------------------------------- security codes
create or replace function public.rout_security_code_issue(p_user uuid, p_purpose text, p_code_hash text, p_ttl_minutes integer)
returns text language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_user uuid := public.rout_current_user_id();
begin
  if v_user is null or p_user is distinct from v_user then return 'no_context'; end if;
  if p_purpose is null or p_purpose not in ('merge', 'password', 'two_factor', 'workspace_convert',
       'delete_account', 'identity_link', 'step_up', 'step_up_sms')
     or p_code_hash is null or p_code_hash !~ '^[A-Za-z0-9+/]{43}=$'
     or p_ttl_minutes is null or p_ttl_minutes not between 1 and 15 then
    return 'invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rout.security_code:' || v_user::text || ':' || p_purpose, 0));
  if (select count(*) from public.security_codes
       where user_id = v_user and purpose = p_purpose and created_at > now() - interval '15 minutes') >= 5 then
    return 'rate_limited';
  end if;
  update public.security_codes set consumed_at = now()
   where user_id = v_user and purpose = p_purpose and consumed_at is null;
  insert into public.security_codes (user_id, purpose, code_hash, expires_at)
  values (v_user, p_purpose, p_code_hash, now() + make_interval(mins => p_ttl_minutes));
  return 'ok';
end $$;

create or replace function public.rout_security_code_consume(p_user uuid, p_purpose text, p_code_hash text)
returns boolean language plpgsql volatile security definer set search_path = pg_catalog as $$
declare
  v_user uuid := public.rout_current_user_id();
  v_row public.security_codes%rowtype;
begin
  if v_user is null or p_user is distinct from v_user or p_purpose is null or p_code_hash is null then return false; end if;
  select * into v_row from public.security_codes
   where user_id = v_user and purpose = p_purpose and consumed_at is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if not found or v_row.attempts >= 5 then return false; end if;
  if v_row.code_hash is distinct from p_code_hash then
    update public.security_codes set attempts = attempts + 1 where id = v_row.id;
    return false;
  end if;
  update public.security_codes set consumed_at = now() where id = v_row.id and consumed_at is null;
  return found;
end $$;

-- Housekeeping without a member: removes only codes that can no longer be used.
create or replace function public.rout_security_code_purge()
returns integer language plpgsql volatile security definer set search_path = pg_catalog as $$
declare n integer;
begin
  delete from public.security_codes
   where expires_at < now() - interval '30 minutes' or consumed_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

-- ------------------------------------------------------------------ phone codes
create or replace function public.rout_phone_code_issue(p_user uuid, p_phone_hash text, p_phone_enc text,
  p_last4 text, p_code_hash text, p_expires_at timestamptz)
returns text language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_user uuid := public.rout_current_user_id();
begin
  if v_user is null or p_user is distinct from v_user then return 'no_context'; end if;
  if p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$' or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_phone_enc is null or length(p_phone_enc) not between 16 and 512 or p_last4 is null or p_last4 !~ '^[0-9]{4}$'
     or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then
    return 'invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rout.phone_code:' || v_user::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('rout.phone_code:' || p_phone_hash, 0));
  if (select count(*) from public.phone_otp_codes where user_id = v_user and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.phone_otp_codes where phone_hash = p_phone_hash and created_at > now() - interval '1 hour') >= 3 then
    return 'rate_limited';
  end if;
  update public.phone_otp_codes set consumed_at = now() where user_id = v_user and consumed_at is null;
  insert into public.phone_otp_codes (user_id, phone_hash, phone_number_enc, phone_last4, code_hash, expires_at)
  values (v_user, p_phone_hash, p_phone_enc, p_last4, p_code_hash, p_expires_at);
  return 'ok';
end $$;

-- Marks the number verified from a consumed code row (shared by every confirm path).
create or replace function public.rout_phone_mark_verified(p_row public.phone_otp_codes)
returns void language sql volatile security definer set search_path = pg_catalog as $$
  insert into public.user_phone_numbers (user_id, phone_number_enc, phone_hash, phone_last4, phone_verified, phone_verified_at)
  values (p_row.user_id, p_row.phone_number_enc, p_row.phone_hash, p_row.phone_last4, true, now())
  on conflict (user_id) do update set phone_number_enc = excluded.phone_number_enc, phone_hash = excluded.phone_hash,
    phone_last4 = excluded.phone_last4, phone_verified = true, phone_verified_at = now(), updated_at = now()
$$;

create or replace function public.rout_phone_code_verify(p_user uuid, p_code_hash text)
returns table (status text, last4 text) language plpgsql volatile security definer set search_path = pg_catalog as $$
declare
  v_user uuid := public.rout_current_user_id();
  v_row public.phone_otp_codes%rowtype;
begin
  if v_user is null or p_user is distinct from v_user then return query select 'no_code'::text, null::text; return; end if;
  select * into v_row from public.phone_otp_codes where user_id = v_user and consumed_at is null
   order by created_at desc limit 1 for update;
  if not found then return query select 'no_code'::text, null::text; return; end if;
  if v_row.expires_at <= now() then return query select 'expired'::text, null::text; return; end if;
  if v_row.attempts >= 5 then return query select 'too_many_attempts'::text, null::text; return; end if;
  if p_code_hash is null or v_row.code_hash is distinct from p_code_hash then
    update public.phone_otp_codes set attempts = attempts + 1 where id = v_row.id;
    return query select 'invalid'::text, null::text; return;
  end if;
  update public.phone_otp_codes set consumed_at = now() where id = v_row.id;
  perform public.rout_phone_mark_verified(v_row);
  return query select 'verified'::text, v_row.phone_last4;
end $$;

create or replace function public.rout_phone_code_cancel(p_user uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_user uuid := public.rout_current_user_id();
begin
  if v_user is null or p_user is distinct from v_user then return; end if;
  update public.phone_otp_codes set consumed_at = now() where user_id = v_user and consumed_at is null;
end $$;

-- Inbound SMS / Telegram (no member context): the server needs the member id to
-- build the keyed code digest, so step 1 names the open code for a number hash,
-- step 2 confirms it. Wrong codes count as tries here as well.
create or replace function public.rout_phone_inbound_candidate(p_phone_hash text)
returns table (code_id uuid, user_id uuid) language sql stable security definer set search_path = pg_catalog as $$
  select c.id, c.user_id from public.phone_otp_codes c
   where p_phone_hash ~ '^[0-9a-f]{64}$' and c.phone_hash = p_phone_hash
     and c.consumed_at is null and c.expires_at > now() and c.attempts < 5
   order by c.created_at desc limit 1
$$;

create or replace function public.rout_phone_inbound_confirm(p_code_id uuid, p_phone_hash text, p_code_hash text)
returns boolean language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_row public.phone_otp_codes%rowtype;
begin
  select * into v_row from public.phone_otp_codes
   where id = p_code_id and phone_hash = p_phone_hash and consumed_at is null and expires_at > now() and attempts < 5
   for update;
  if not found then return false; end if;
  if p_code_hash is null or v_row.code_hash is distinct from p_code_hash then
    update public.phone_otp_codes set attempts = attempts + 1 where id = v_row.id;
    return false;
  end if;
  update public.phone_otp_codes set consumed_at = now() where id = v_row.id;
  perform public.rout_phone_mark_verified(v_row);
  return true;
end $$;

-- Manual queue for international numbers: database-checked admins only.
create or replace function public.rout_phone_pending_list(p_limit integer)
returns table (id uuid, phone_last4 text, created_at timestamptz, attempts integer)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if not public.rout_caller_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select c.id, c.phone_last4, c.created_at, c.attempts from public.phone_otp_codes c
    where c.consumed_at is null and c.expires_at > now()
    order by c.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create or replace function public.rout_phone_admin_approve(p_code_id uuid)
returns boolean language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_row public.phone_otp_codes%rowtype;
begin
  if not public.rout_caller_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.phone_otp_codes set consumed_at = now()
   where id = p_code_id and consumed_at is null and expires_at > now()
  returning * into v_row;
  if not found then return false; end if;
  perform public.rout_phone_mark_verified(v_row);
  return true;
end $$;

-- ---------------------------------------------------- clearing for a member
-- Sunset scrub (runs as the member): drops the member's own codes and tokens.
create or replace function public.rout_auth_secrets_clear()
returns void language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_user uuid := public.rout_current_user_id();
begin
  if v_user is null then return; end if;
  delete from public.auth_tokens where user_id = v_user;
  delete from public.security_codes where user_id = v_user;
  delete from public.phone_otp_codes where user_id = v_user;
end $$;

-- Account purge (no member context): only for a deletion that is genuinely due.
create or replace function public.rout_auth_secrets_purge(p_user uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog as $$
begin
  if not public.rout_purge_due(p_user) then raise exception 'purge_not_due' using errcode = '42501'; end if;
  delete from public.auth_tokens where user_id = p_user;
  delete from public.security_codes where user_id = p_user;
  delete from public.phone_otp_codes where user_id = p_user;
end $$;

-- ------------------------------------------------------------- privileges
do $$
declare f text;
begin
  foreach f in array array[
    'public.rout_caller_is_admin()',
    'public.rout_security_code_issue(uuid,text,text,integer)',
    'public.rout_security_code_consume(uuid,text,text)',
    'public.rout_security_code_purge()',
    'public.rout_phone_code_issue(uuid,text,text,text,text,timestamptz)',
    'public.rout_phone_mark_verified(public.phone_otp_codes)',
    'public.rout_phone_code_verify(uuid,text)',
    'public.rout_phone_code_cancel(uuid)',
    'public.rout_phone_inbound_candidate(text)',
    'public.rout_phone_inbound_confirm(uuid,text,text)',
    'public.rout_phone_pending_list(integer)',
    'public.rout_phone_admin_approve(uuid)',
    'public.rout_auth_secrets_clear()',
    'public.rout_auth_secrets_purge(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    if f <> 'public.rout_phone_mark_verified(public.phone_otp_codes)' then
      execute format('grant execute on function %s to rout_app', f);
    end if;
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['security_codes', 'phone_otp_codes', 'auth_tokens'] loop
    execute format('drop policy if exists rout_server on public.%I', t);
    execute format('revoke all on table public.%I from rout_app', t);
  end loop;
end $$;
