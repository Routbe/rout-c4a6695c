-- 0202 — Account-less AI agent sandboxes.
-- An AI agent without any ROUT account solves a proof-of-work, receives a
-- 48-hour sandbox key and builds exactly one unowned staging workspace:
-- workspace, login-app specs and a Studio draft. A human claims it with the
-- link, the QR code (same link) or a typed claim code; only SHA-256 hashes of
-- key, link token and code are stored. Login apps are specs until the claim;
-- the app layer then creates real OAuth clients owned by the claimer.
-- Idempotent; meant for manual execution in the Neon SQL editor as owner.

create table if not exists public.agent_sandboxes (
  id           uuid primary key default gen_random_uuid(),
  key_hash     text not null unique,
  pow_hash     text not null unique,
  ip_bucket    text not null,
  agent_name   text not null,
  workspace_id uuid unique references public.workspaces (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  constraint agent_sandboxes_key_hash check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint agent_sandboxes_pow_hash check (pow_hash ~ '^[0-9a-f]{64}$'),
  constraint agent_sandboxes_name check (char_length(agent_name) between 1 and 80),
  constraint agent_sandboxes_48h check (expires_at = created_at + interval '48 hours')
);
create index if not exists agent_sandboxes_ip_idx on public.agent_sandboxes (ip_bucket, created_at);
revoke all on public.agent_sandboxes from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.agent_sandboxes from rout_app;
  end if;
end $$;
alter table public.agent_sandboxes enable row level security;

alter table public.agent_workspace_claims add column if not exists code_hash text unique;
alter table public.agent_workspace_claims add column if not exists sandbox_id uuid references public.agent_sandboxes (id) on delete set null;
alter table public.agent_workspace_claims add column if not exists pending_apps jsonb not null default '[]'::jsonb;
alter table public.agent_workspace_claims alter column requested_by drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agent_workspace_claims_code_hash') then
    alter table public.agent_workspace_claims
      add constraint agent_workspace_claims_code_hash check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agent_workspace_claims_pending_apps') then
    alter table public.agent_workspace_claims
      add constraint agent_workspace_claims_pending_apps check (jsonb_typeof(pending_apps) = 'array' and jsonb_array_length(pending_apps) <= 3);
  end if;
end $$;

-- Register: one-time proof-of-work, at most 5 sandboxes per IP bucket per 24 h.
create or replace function public.rout_agent_sandbox_register(p_key_hash text, p_pow_hash text, p_ip_bucket text, p_agent_name text)
returns table(sandbox_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
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
  values (p_key_hash, p_pow_hash, p_ip_bucket, p_agent_name, v_now, v_now + interval '48 hours')
  returning id into v_id;
  return query select v_id, v_now + interval '48 hours';
end; $$;

-- Live sandbox lookup; never returns hashes.
create or replace function public.rout_agent_sandbox_context(p_key_hash text)
returns table(sandbox_id uuid, agent_name text, workspace_id uuid, slug text, expires_at timestamptz, claimed boolean)
language sql stable security definer set search_path to 'public'
as $$
  select s.id, s.agent_name, s.workspace_id, w.slug, s.expires_at, c.claimed_at is not null
    from public.agent_sandboxes s
    left join public.workspaces w on w.id = s.workspace_id
    left join public.agent_workspace_claims c on c.workspace_id = s.workspace_id
   where s.key_hash = p_key_hash and s.revoked_at is null and s.expires_at > now()
   limit 1
$$;

-- Provision the single workspace of a sandbox, with link-token and code hashes and a seeded Studio draft.
create or replace function public.rout_agent_sandbox_provision(
  p_key_hash text, p_name text, p_slug text, p_description text,
  p_token_hash text, p_code_hash text, p_draft jsonb
)
returns table(workspace_id uuid, slug text, expires_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
declare v_s public.agent_sandboxes%rowtype; v_ws uuid;
begin
  select * into v_s from public.agent_sandboxes s
   where s.key_hash = p_key_hash and s.revoked_at is null and s.expires_at > now() for update;
  if not found then raise exception 'sandbox_invalid'; end if;
  if v_s.workspace_id is not null then raise exception 'sandbox_has_workspace'; end if;
  if exists (select 1 from public.workspaces w where w.slug = lower(p_slug)) then raise exception 'slug_taken'; end if;
  if jsonb_typeof(p_draft) <> 'object' then raise exception 'validation: draft must be an object'; end if;

  insert into public.workspaces (name, slug, description, plan)
  values (p_name, lower(p_slug), nullif(p_description, ''), 'free') returning id into v_ws;
  insert into public.agent_workspace_claims (workspace_id, client_id, requested_by, token_hash, code_hash, sandbox_id, created_at, expires_at)
  values (v_ws, 'sandbox:' || v_s.id::text, null, p_token_hash, p_code_hash, v_s.id, v_s.created_at, v_s.expires_at);
  insert into public.workspace_profile_drafts (workspace_id, payload) values (v_ws, p_draft);
  update public.agent_sandboxes s set workspace_id = v_ws where s.id = v_s.id;
  return query select v_ws, lower(p_slug), v_s.expires_at;
end; $$;

-- Replace the login-app specs (max 3) of an unclaimed sandbox workspace.
create or replace function public.rout_agent_sandbox_set_apps(p_key_hash text, p_apps jsonb)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare v_ws uuid;
begin
  if jsonb_typeof(p_apps) <> 'array' or jsonb_array_length(p_apps) > 3 then raise exception 'validation: max 3 apps'; end if;
  select s.workspace_id into v_ws from public.agent_sandboxes s
   where s.key_hash = p_key_hash and s.revoked_at is null and s.expires_at > now();
  if v_ws is null then raise exception 'sandbox_invalid'; end if;
  update public.agent_workspace_claims c set pending_apps = p_apps
   where c.workspace_id = v_ws and c.claimed_at is null;
  if not found then raise exception 'sandbox_claimed'; end if;
  return jsonb_array_length(p_apps);
end; $$;

-- Patch the Studio draft (same merge as patch_workspace_profile_draft) of an unclaimed sandbox workspace.
create or replace function public.rout_agent_sandbox_patch_draft(p_key_hash text, p_fields jsonb, p_prefs jsonb)
returns table(revision bigint)
language plpgsql security definer set search_path to 'public'
as $$
declare v_ws uuid;
begin
  if jsonb_typeof(p_fields) <> 'object' or jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'validation: draft patch must be an object';
  end if;
  select s.workspace_id into v_ws from public.agent_sandboxes s
    join public.agent_workspace_claims c on c.workspace_id = s.workspace_id and c.claimed_at is null
   where s.key_hash = p_key_hash and s.revoked_at is null and s.expires_at > now();
  if v_ws is null then raise exception 'sandbox_invalid'; end if;
  return query
    update public.workspace_profile_drafts d
       set payload = (d.payload || (p_fields - 'displayPrefs' - 'username' - 'avatarUrl' - 'faviconUrl'))
             || jsonb_build_object('displayPrefs',
                  (case when jsonb_typeof(d.payload -> 'displayPrefs') = 'object' then d.payload -> 'displayPrefs' else '{}'::jsonb end)
                  || p_prefs),
           revision = d.revision + 1,
           updated_at = now()
     where d.workspace_id = v_ws
    returning d.revision;
end; $$;

-- Read back the draft and app specs for the agent.
create or replace function public.rout_agent_sandbox_state(p_key_hash text)
returns table(draft jsonb, revision bigint, apps jsonb)
language sql stable security definer set search_path to 'public'
as $$
  select d.payload, d.revision, c.pending_apps
    from public.agent_sandboxes s
    join public.workspace_profile_drafts d on d.workspace_id = s.workspace_id
    join public.agent_workspace_claims c on c.workspace_id = s.workspace_id
   where s.key_hash = p_key_hash and s.revoked_at is null and s.expires_at > now()
   limit 1
$$;

-- Preview/claim now accept the hash of either the link token or the claim code.
create or replace function public.rout_agent_claim_preview(p_token_hash text)
returns table(name text, slug text, expires_at timestamptz, claimed boolean, expired boolean, app_name text)
language sql stable security definer set search_path to 'public'
as $$
  select w.name, w.slug, c.expires_at, c.claimed_at is not null, c.expires_at <= now(),
         coalesce((select o.name from public.oauth_clients o where o.client_id = c.client_id limit 1),
                  (select s.agent_name from public.agent_sandboxes s where s.id = c.sandbox_id))
    from public.agent_workspace_claims c
    join public.workspaces w on w.id = c.workspace_id
   where public.rout_current_user_id() is not null
     and (c.token_hash = p_token_hash or c.code_hash = p_token_hash)
   limit 1
$$;

create or replace function public.rout_claim_agent_workspace_v2(p_hash text)
returns table(workspace_id uuid, slug text, pending_apps jsonb)
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := public.rout_current_user_id(); v_claim public.agent_workspace_claims%rowtype; v_slug text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_claim from public.agent_workspace_claims c
   where c.token_hash = p_hash or c.code_hash = p_hash for update;
  if not found then raise exception 'claim_not_found'; end if;
  if v_claim.claimed_at is not null then raise exception 'claim_used'; end if;
  if v_claim.expires_at <= now() then raise exception 'claim_expired'; end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_claim.workspace_id, v_uid, 'owner')
  on conflict on constraint workspace_members_pkey do update set role = 'owner';
  update public.agent_workspace_claims c
     set claimed_at = now(), claimed_by = v_uid, pending_apps = '[]'::jsonb
   where c.workspace_id = v_claim.workspace_id;
  update public.workspace_profile_drafts d set updated_by = v_uid where d.workspace_id = v_claim.workspace_id;
  if v_claim.sandbox_id is not null then
    update public.agent_sandboxes s set revoked_at = now() where s.id = v_claim.sandbox_id;
  end if;
  select w.slug into v_slug from public.workspaces w where w.id = v_claim.workspace_id;
  return query select v_claim.workspace_id, v_slug, v_claim.pending_apps;
end; $$;

-- Purge also removes expired sandboxes without a workspace.
create or replace function public.rout_purge_expired_agent_sandboxes()
returns integer
language sql security definer set search_path to 'public'
as $$
  with d as (delete from public.agent_sandboxes s
              where s.expires_at <= now() - interval '1 day' and s.workspace_id is null
              returning 1)
  select count(*)::integer from d
$$;

revoke all on function public.rout_agent_sandbox_register(text, text, text, text) from public;
revoke all on function public.rout_agent_sandbox_context(text) from public;
revoke all on function public.rout_agent_sandbox_provision(text, text, text, text, text, text, jsonb) from public;
revoke all on function public.rout_agent_sandbox_set_apps(text, jsonb) from public;
revoke all on function public.rout_agent_sandbox_patch_draft(text, jsonb, jsonb) from public;
revoke all on function public.rout_agent_sandbox_state(text) from public;
revoke all on function public.rout_claim_agent_workspace_v2(text) from public;
revoke all on function public.rout_purge_expired_agent_sandboxes() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_agent_sandbox_register(text, text, text, text) to rout_app;
    grant execute on function public.rout_agent_sandbox_context(text) to rout_app;
    grant execute on function public.rout_agent_sandbox_provision(text, text, text, text, text, text, jsonb) to rout_app;
    grant execute on function public.rout_agent_sandbox_set_apps(text, jsonb) to rout_app;
    grant execute on function public.rout_agent_sandbox_patch_draft(text, jsonb, jsonb) to rout_app;
    grant execute on function public.rout_agent_sandbox_state(text) to rout_app;
    grant execute on function public.rout_claim_agent_workspace_v2(text) to rout_app;
    grant execute on function public.rout_purge_expired_agent_sandboxes() to rout_app;
  end if;
end $$;
