-- Agent sandboxes and agent-provisioned workspaces live 24 hours (was 48).
-- Unclaimed workspaces, their drafts/claims (cascade), QR codes, OAuth apps,
-- bookings and transfers, plus expired sandbox keys, are hard-deleted by
-- rout_purge_unclaimed_agent_workspaces().

alter table public.agent_workspace_claims drop constraint if exists agent_workspace_claims_48h;
alter table public.agent_sandboxes drop constraint if exists agent_sandboxes_48h;

update public.agent_workspace_claims set expires_at = created_at + interval '24 hours'
 where claimed_at is null;
update public.agent_sandboxes set expires_at = created_at + interval '24 hours';

alter table public.agent_workspace_claims add constraint agent_workspace_claims_24h
  check (claimed_at is not null or expires_at = created_at + interval '24 hours');
alter table public.agent_sandboxes add constraint agent_sandboxes_24h
  check (expires_at = created_at + interval '24 hours');

create or replace function public.rout_agent_sandbox_register(p_key_hash text, p_pow_hash text, p_ip_bucket text, p_agent_name text)
 returns table(sandbox_id uuid, expires_at timestamptz)
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_now timestamptz := now(); v_id uuid; v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('agent_sandbox_ip:' || p_ip_bucket));
  select count(*) into v_count from public.agent_sandboxes s
   where s.ip_bucket = p_ip_bucket and s.created_at > v_now - interval '24 hours';
  if v_count >= 5 then raise exception 'sandbox_quota_reached'; end if;
  if exists (select 1 from public.agent_sandboxes s where s.pow_hash = p_pow_hash) then
    raise exception 'challenge_used';
  end if;
  insert into public.agent_sandboxes (key_hash, pow_hash, ip_bucket, agent_name, created_at, expires_at)
  values (p_key_hash, p_pow_hash, p_ip_bucket, p_agent_name, v_now, v_now + interval '24 hours')
  returning id into v_id;
  return query select v_id, v_now + interval '24 hours';
end; $function$;

create or replace function public.rout_agent_provision_workspace(p_client_id text, p_name text, p_slug text, p_description text, p_token_hash text)
 returns table(workspace_id uuid, slug text, expires_at timestamptz)
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.rout_current_user_id();
  v_open integer;
  v_ws uuid;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('agent_provision:' || v_uid::text));
  select count(*) into v_open from public.agent_workspace_claims c
   where c.requested_by = v_uid and c.claimed_at is null and c.expires_at > v_now;
  if v_open >= 3 then raise exception 'agent_quota_reached'; end if;
  if exists (select 1 from public.workspaces w where w.slug = lower(p_slug)) then
    raise exception 'slug_taken';
  end if;
  insert into public.workspaces (name, slug, description, plan)
  values (p_name, lower(p_slug), nullif(p_description, ''), 'free')
  returning id into v_ws;
  insert into public.agent_workspace_claims (workspace_id, client_id, requested_by, token_hash, created_at, expires_at)
  values (v_ws, p_client_id, v_uid, p_token_hash, v_now, v_now + interval '24 hours');
  return query select v_ws, lower(p_slug), v_now + interval '24 hours';
end;
$function$;

create or replace function public.rout_purge_unclaimed_agent_workspaces()
 returns integer
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(c.workspace_id), '{}') into v_ids
    from (select workspace_id from public.agent_workspace_claims
           where claimed_at is null and expires_at <= now()
           order by expires_at
           limit 500
           for update skip locked) c;
  if cardinality(v_ids) > 0 then
    delete from public.oauth_clients where workspace_id = any (v_ids);
    delete from public.tracked_qrs where workspace_id = any (v_ids);
    delete from public.bookings where workspace_id = any (v_ids);
    delete from public.workspace_transfers where workspace_id = any (v_ids);
    delete from public.workspaces where id = any (v_ids); -- drafts and claims cascade
  end if;
  -- Expired sandbox keys (and sandboxes that never created a workspace).
  delete from public.agent_sandboxes where expires_at <= now();
  return cardinality(v_ids);
end;
$function$;
