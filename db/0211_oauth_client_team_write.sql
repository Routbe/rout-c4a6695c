-- 0211 — Team write access to workspace OAuth apps.
-- Every member may still read the apps of their workspace, but creating,
-- editing, rotating secrets and deleting now needs owner, admin or developer.
-- This mirrors src/lib/oauth/client-access.ts (APP_EDITOR_ROLES); the app layer
-- also checks it, this is the database backstop. Personal apps keep rout_owner.
-- Idempotent.

drop policy if exists rout_scope on public.oauth_clients;
create policy rout_scope on public.oauth_clients for select
  using (workspace_id is not null and public.rout_is_workspace_member(workspace_id));

drop policy if exists rout_team_insert on public.oauth_clients;
create policy rout_team_insert on public.oauth_clients for insert
  with check (workspace_id is not null and public.rout_workspace_role(workspace_id) in ('owner', 'admin', 'developer'));

drop policy if exists rout_team_update on public.oauth_clients;
create policy rout_team_update on public.oauth_clients for update
  using (workspace_id is not null and public.rout_workspace_role(workspace_id) in ('owner', 'admin', 'developer'))
  with check (workspace_id is not null and public.rout_workspace_role(workspace_id) in ('owner', 'admin', 'developer'));

drop policy if exists rout_team_delete on public.oauth_clients;
create policy rout_team_delete on public.oauth_clients for delete
  using (workspace_id is not null and public.rout_workspace_role(workspace_id) in ('owner', 'admin', 'developer'));
