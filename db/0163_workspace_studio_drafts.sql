-- 0163 — Workspace Studio parity: a workspace's Profile Hub uses the same Studio
-- engine as a personal profile. The working copy lives here (never public);
-- publishing copies it into workspaces.public_profile -> 'studio', which the
-- public page rout.be/w/<slug> renders. Same section-merge semantics as 0160.
-- Idempotent; meant for manual execution in the Neon SQL editor as owner.

create table if not exists public.workspace_profile_drafts (
  workspace_id       uuid primary key references public.workspaces (id) on delete cascade,
  payload            jsonb not null default '{}'::jsonb,
  revision           bigint not null default 1,
  published_revision bigint not null default 0,
  updated_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  published_at       timestamptz,
  constraint workspace_profile_drafts_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint workspace_profile_drafts_revisions check (revision >= 1 and published_revision between 0 and revision)
);

-- Least privilege: the runtime reads, creates and updates drafts; deleting only
-- happens through the workspace cascade.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.workspace_profile_drafts from rout_app;
    grant select, insert, update on public.workspace_profile_drafts to rout_app;
  end if;
end $$;
revoke all on public.workspace_profile_drafts from public;

alter table public.workspace_profile_drafts enable row level security;
drop policy if exists rout_member_read on public.workspace_profile_drafts;
create policy rout_member_read on public.workspace_profile_drafts
  for select using (public.rout_is_workspace_member(workspace_id));
drop policy if exists rout_editor_insert on public.workspace_profile_drafts;
create policy rout_editor_insert on public.workspace_profile_drafts
  for insert with check (public.rout_workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
drop policy if exists rout_editor_update on public.workspace_profile_drafts;
create policy rout_editor_update on public.workspace_profile_drafts
  for update using (public.rout_workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (public.rout_workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

-- Section merge, identical to patch_profile_draft (0160). SECURITY INVOKER: the
-- caller's RLS decides whether the row is writable.
create or replace function public.patch_workspace_profile_draft(
  p_workspace_id uuid,
  p_fields jsonb,
  p_prefs jsonb,
  p_drop_prefs text[]
)
returns table(revision bigint, published_revision bigint, updated_at timestamptz, published_at timestamptz)
language plpgsql
set search_path to 'public'
as $$
declare
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_prefs jsonb := coalesce(p_prefs, '{}'::jsonb);
begin
  if jsonb_typeof(v_fields) <> 'object' or jsonb_typeof(v_prefs) <> 'object' then
    raise exception 'validation: draft patch must be an object';
  end if;

  return query
    update public.workspace_profile_drafts d
       set payload = (d.payload || (v_fields - 'displayPrefs' - 'username'))
             || jsonb_build_object(
               'displayPrefs',
               ((case when jsonb_typeof(d.payload -> 'displayPrefs') = 'object'
                      then d.payload -> 'displayPrefs' else '{}'::jsonb end)
                 - coalesce(p_drop_prefs, '{}'::text[]))
               || v_prefs
             ),
           revision = d.revision + 1,
           updated_by = public.rout_current_user_id(),
           updated_at = now()
     where d.workspace_id = p_workspace_id
    returning d.revision, d.published_revision, d.updated_at, d.published_at;

  if not found then
    raise exception 'draft_not_found';
  end if;
end;
$$;

revoke all on function public.patch_workspace_profile_draft(uuid, jsonb, jsonb, text[]) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.patch_workspace_profile_draft(uuid, jsonb, jsonb, text[]) to rout_app;
  end if;
end $$;
