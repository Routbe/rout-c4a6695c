-- 0203 — rout_agent_sandbox_provision returned the requested slug, but the
-- workspace slug trigger (0122) may append a suffix. Return the stored slug so
-- the agent's claim URL and profile link match the real workspace.
create or replace function public.rout_agent_sandbox_provision(
  p_key_hash text, p_name text, p_slug text, p_description text,
  p_token_hash text, p_code_hash text, p_draft jsonb
)
returns table(workspace_id uuid, slug text, expires_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
declare v_s public.agent_sandboxes%rowtype; v_ws uuid; v_slug text;
begin
  select * into v_s from public.agent_sandboxes s
   where s.key_hash = p_key_hash and s.revoked_at is null and s.expires_at > now() for update;
  if not found then raise exception 'sandbox_invalid'; end if;
  if v_s.workspace_id is not null then raise exception 'sandbox_has_workspace'; end if;
  if exists (select 1 from public.workspaces w where w.slug = lower(p_slug)) then raise exception 'slug_taken'; end if;
  if jsonb_typeof(p_draft) <> 'object' then raise exception 'validation: draft must be an object'; end if;

  insert into public.workspaces (name, slug, description, plan)
  values (p_name, lower(p_slug), nullif(p_description, ''), 'free') returning id, workspaces.slug into v_ws, v_slug;
  insert into public.agent_workspace_claims (workspace_id, client_id, requested_by, token_hash, code_hash, sandbox_id, created_at, expires_at)
  values (v_ws, 'sandbox:' || v_s.id::text, null, p_token_hash, p_code_hash, v_s.id, v_s.created_at, v_s.expires_at);
  insert into public.workspace_profile_drafts (workspace_id, payload)
  values (v_ws, jsonb_set(p_draft, '{username}', to_jsonb(v_slug), true));
  update public.agent_sandboxes s set workspace_id = v_ws where s.id = v_s.id;
  return query select v_ws, v_slug, v_s.expires_at;
end; $$;
revoke all on function public.rout_agent_sandbox_provision(text, text, text, text, text, text, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_agent_sandbox_provision(text, text, text, text, text, text, jsonb) to rout_app;
  end if;
end $$;
