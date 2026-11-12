-- 0168 — Chronos agent audit log, snapshots and agent webhooks.
-- Every mutation by an agent OAuth token is logged with a JSONB
-- previous_state snapshot, so a human owner can revert any agent action.
-- Agents register one agent_webhook_url on their OAuth client; ROUT posts
-- lifecycle events (workspace.upgraded, domain.verified) there.
-- Idempotent; meant for manual execution in the Neon SQL editor as owner.

create table if not exists public.agent_audit_logs (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references public.workspaces (id) on delete cascade,
  user_id          uuid not null,
  actor_client_id  text not null,
  action           text not null,
  target_table     text,
  target_id        text,
  previous_state   jsonb,
  new_state        jsonb,
  reverted_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists agent_audit_logs_workspace_idx
  on public.agent_audit_logs (workspace_id, created_at desc);

revoke all on public.agent_audit_logs from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select on public.agent_audit_logs to rout_app;
  end if;
end $$;

alter table public.agent_audit_logs enable row level security;
drop policy if exists rout_agent_audit_read on public.agent_audit_logs;
-- The delegating human reads their own agent's actions; workspace owners/admins
-- read the workspace timeline. Writes go through definers.
create policy rout_agent_audit_read on public.agent_audit_logs
  for select using (
    user_id = public.rout_current_user_id()
    or (workspace_id is not null and public.rout_workspace_role(workspace_id) in ('owner', 'admin'))
  );

-- Append-only insert for the app role: the actor must be the current user.
create or replace function public.rout_agent_audit_log(
  p_workspace_id uuid, p_user_id uuid, p_client_id text, p_action text,
  p_target_table text, p_target_id text, p_previous jsonb, p_new jsonb
) returns uuid
  language plpgsql security definer set search_path = public
  as $$
  declare v_id uuid;
  begin
    if p_user_id is distinct from public.rout_current_user_id() then
      raise exception 'actor_mismatch';
    end if;
    insert into public.agent_audit_logs
      (workspace_id, user_id, actor_client_id, action, target_table, target_id, previous_state, new_state)
    values (p_workspace_id, p_user_id, p_client_id, p_action, p_target_table, p_target_id, p_previous, p_new)
    returning id into v_id;
    return v_id;
  end $$;
revoke all on function public.rout_agent_audit_log(uuid, uuid, text, text, text, text, jsonb, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_agent_audit_log(uuid, uuid, text, text, text, text, jsonb, jsonb) to rout_app;
  end if;
end $$;

-- Mark a log entry reverted; only owners/admins of the workspace, only once.
create or replace function public.rout_agent_audit_mark_reverted(p_log_id uuid) returns void
  language plpgsql security definer set search_path = public
  as $$
  begin
    update public.agent_audit_logs l
       set reverted_at = now()
     where l.id = p_log_id
       and l.reverted_at is null
       and public.rout_workspace_role(l.workspace_id) in ('owner', 'admin');
    if not found then raise exception 'revert_not_allowed'; end if;
  end $$;
revoke all on function public.rout_agent_audit_mark_reverted(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_agent_audit_mark_reverted(uuid) to rout_app;
  end if;
end $$;

-- Revert of workspace.provision: hard-delete only an unclaimed agent workspace
-- that the calling human's agent provisioned. Claimed workspaces are untouchable.
create or replace function public.rout_agent_audit_revert_workspace(p_workspace_id uuid) returns void
  language plpgsql security definer set search_path = public
  as $$
  begin
    delete from public.workspaces w
     where w.id = p_workspace_id
       and exists (
         select 1 from public.agent_workspace_claims c
          where c.workspace_id = w.id
            and c.claimed_at is null
            and c.requested_by = public.rout_current_user_id()
       );
    if not found then raise exception 'revert_not_allowed'; end if;
  end $$;
revoke all on function public.rout_agent_audit_revert_workspace(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_agent_audit_revert_workspace(uuid) to rout_app;
  end if;
end $$;

-- One outbound webhook URL per agent OAuth client (https only).
alter table public.oauth_clients
  add column if not exists agent_webhook_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'oauth_clients_agent_webhook_https') then
    alter table public.oauth_clients
      add constraint oauth_clients_agent_webhook_https
      check (agent_webhook_url is null or (agent_webhook_url like 'https://%' and char_length(agent_webhook_url) <= 2048));
  end if;
end $$;
