-- 0120 — Explicit RLS policies for every RLS-enabled public table that had none.
-- Pattern: the caller id comes from current_setting('rout.user_id', true) (set per transaction by a
-- non-bypass role). Own rows: user_id / owner_id / host_user_id = caller. Workspace rows: caller is a
-- member. Server-only tables (secrets, tokens, codes, throttles, audit, queues) intentionally keep NO
-- policy: deny-by-default for any role without bypassrls. Idempotent: drop policy if exists + create.

create or replace function public.rout_current_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('rout.user_id', true), '')::uuid $$;

create or replace function public.rout_is_workspace_member(ws uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.workspace_members m
                       where m.workspace_id = ws and m.user_id = public.rout_current_user_id()) $$;

revoke all on function public.rout_is_workspace_member(uuid) from public;

do $$
declare
  r record;
  server_only text[] := array[
    'admin_permissions','api_keys','auth_tokens','bunq_oauth_tokens','oauth_auth_codes',
    'oauth_step_up_codes','phone_otp_codes','profile_ingest_tokens','psp_credentials','security_codes',
    'user_sessions','user_roles','forwarding_confirmation_sends','availability_jobs','alias_sync_jobs',
    'sepa_review_queue','verification_payments','security_events','oauth_consents'
  ];
  owner_col text;
  expr text;
begin
  for r in
    select c.relname,
           array(select a.attname::text from pg_attribute a
                 where a.attrelid = c.oid and not a.attisdropped
                   and a.attname in ('user_id','owner_id','host_user_id','workspace_id')) as cols
    from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r' and c.relrowsecurity
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname <> 'rout_scope')
  loop
    continue when r.relname = any(server_only) or cardinality(r.cols) = 0;
    expr := null;
    foreach owner_col in array array['user_id','owner_id','host_user_id'] loop
      if owner_col = any(r.cols) then
        expr := coalesce(expr || ' or ', '') || format('%I = public.rout_current_user_id()', owner_col);
      end if;
    end loop;
    if 'workspace_id' = any(r.cols) and r.relname <> 'workspace_members' then
      expr := coalesce(expr || ' or ', '') || '(workspace_id is not null and public.rout_is_workspace_member(workspace_id))';
    end if;
    continue when expr is null;
    execute format('drop policy if exists rout_scope on public.%I', r.relname);
    execute format('create policy rout_scope on public.%I using (%s) with check (%s)', r.relname, expr, expr);
  end loop;
end $$;
