-- 0164 — Agent-provisioned workspaces (claim link only, 48 hours, zero e-mail).
-- An AI agent acting with a human-delegated OAuth token creates an unowned
-- staging workspace. Nobody is a member until a signed-in human opens the claim
-- link; that human becomes Owner and the agent stays visible as a bot.
-- Unclaimed after exactly 48 hours, the workspace and everything in it is
-- hard-deleted by rout_purge_unclaimed_agent_workspaces() (cron).
-- Only a SHA-256 hash of the claim token is stored. Idempotent; meant for
-- manual execution in the Neon SQL editor as owner.

create table if not exists public.agent_workspace_claims (
  workspace_id   uuid primary key references public.workspaces (id) on delete cascade,
  client_id      text not null,
  requested_by   uuid references public.users (id) on delete set null,
  token_hash     text not null unique,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  claimed_at     timestamptz,
  claimed_by     uuid references public.users (id) on delete set null,
  bot_revoked_at timestamptz,
  constraint agent_workspace_claims_client check (char_length(client_id) between 1 and 200),
  constraint agent_workspace_claims_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint agent_workspace_claims_48h check (expires_at = created_at + interval '48 hours'),
  constraint agent_workspace_claims_claim_order check (claimed_by is null or claimed_at is not null),
  constraint agent_workspace_claims_revoke_order check (bot_revoked_at is null or claimed_at is not null)
);
create index if not exists agent_workspace_claims_open_expiry_idx
  on public.agent_workspace_claims (expires_at) where claimed_at is null;
create index if not exists agent_workspace_claims_open_requester_idx
  on public.agent_workspace_claims (requested_by) where claimed_at is null;

-- Least privilege: members of a claimed workspace see which bot provisioned it
-- (never the token hash); owners/admins can only revoke the bot. Provisioning,
-- claiming and purging go through the SECURITY DEFINER functions below.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.agent_workspace_claims from rout_app;
    grant select (workspace_id, client_id, created_at, claimed_at, bot_revoked_at) on public.agent_workspace_claims to rout_app;
    grant update (bot_revoked_at) on public.agent_workspace_claims to rout_app;
  end if;
end $$;
revoke all on public.agent_workspace_claims from public;

alter table public.agent_workspace_claims enable row level security;
drop policy if exists rout_member_read on public.agent_workspace_claims;
create policy rout_member_read on public.agent_workspace_claims
  for select using (claimed_at is not null and public.rout_is_workspace_member(workspace_id));
drop policy if exists rout_admin_revoke on public.agent_workspace_claims;
create policy rout_admin_revoke on public.agent_workspace_claims
  for update using (claimed_at is not null and public.rout_workspace_role(workspace_id) in ('owner', 'admin'))
  with check (claimed_at is not null and public.rout_workspace_role(workspace_id) in ('owner', 'admin'));

-- Provision: one unowned staging workspace. At most 3 open (unclaimed, unexpired)
-- per delegating human; the limit lives here so no caller can raise it.
create or replace function public.rout_agent_provision_workspace(
  p_client_id text,
  p_name text,
  p_slug text,
  p_description text,
  p_token_hash text
)
returns table(workspace_id uuid, slug text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
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
  values (v_ws, p_client_id, v_uid, p_token_hash, v_now, v_now + interval '48 hours');

  return query select v_ws, lower(p_slug), v_now + interval '48 hours';
end;
$$;

-- Preview for the claim page (signed-in humans only); never returns the hash.
create or replace function public.rout_agent_claim_preview(p_token_hash text)
returns table(name text, slug text, expires_at timestamptz, claimed boolean, expired boolean, app_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select w.name, w.slug, c.expires_at, c.claimed_at is not null, c.expires_at <= now(),
         (select o.name from public.oauth_clients o where o.client_id = c.client_id limit 1)
    from public.agent_workspace_claims c
    join public.workspaces w on w.id = c.workspace_id
   where public.rout_current_user_id() is not null and c.token_hash = p_token_hash
   limit 1
$$;

-- Claim: single use, before expiry; the signed-in human becomes Owner.
create or replace function public.rout_claim_agent_workspace(p_token_hash text)
returns table(workspace_id uuid, slug text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := public.rout_current_user_id();
  v_claim public.agent_workspace_claims%rowtype;
  v_slug text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_claim from public.agent_workspace_claims c where c.token_hash = p_token_hash for update;
  if not found then raise exception 'claim_not_found'; end if;
  if v_claim.claimed_at is not null then raise exception 'claim_used'; end if;
  if v_claim.expires_at <= now() then raise exception 'claim_expired'; end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_claim.workspace_id, v_uid, 'owner')
  on conflict on constraint workspace_members_pkey do update set role = 'owner';
  update public.agent_workspace_claims c
     set claimed_at = now(), claimed_by = v_uid
   where c.workspace_id = v_claim.workspace_id;
  select w.slug into v_slug from public.workspaces w where w.id = v_claim.workspace_id;
  return query select v_claim.workspace_id, v_slug;
end;
$$;

-- Cleanup (cron, no signed-in caller): hard delete every workspace whose claim
-- expired unclaimed, including rows that would otherwise only lose their
-- workspace link (OAuth apps, QR codes, bookings, transfers). Safe to call any time.
create or replace function public.rout_purge_unclaimed_agent_workspaces()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(c.workspace_id), '{}') into v_ids
    from (select workspace_id from public.agent_workspace_claims
           where claimed_at is null and expires_at <= now()
           order by expires_at
           limit 500
           for update skip locked) c;
  if cardinality(v_ids) = 0 then return 0; end if;

  delete from public.oauth_clients where workspace_id = any (v_ids);
  delete from public.tracked_qrs where workspace_id = any (v_ids);
  delete from public.bookings where workspace_id = any (v_ids);
  delete from public.workspace_transfers where workspace_id = any (v_ids);
  delete from public.workspaces where id = any (v_ids);
  return cardinality(v_ids);
end;
$$;

revoke all on function public.rout_agent_provision_workspace(text, text, text, text, text) from public;
revoke all on function public.rout_agent_claim_preview(text) from public;
revoke all on function public.rout_claim_agent_workspace(text) from public;
revoke all on function public.rout_purge_unclaimed_agent_workspaces() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_agent_provision_workspace(text, text, text, text, text) to rout_app;
    grant execute on function public.rout_agent_claim_preview(text) to rout_app;
    grant execute on function public.rout_claim_agent_workspace(text) to rout_app;
    grant execute on function public.rout_purge_unclaimed_agent_workspaces() to rout_app;
  end if;
end $$;
