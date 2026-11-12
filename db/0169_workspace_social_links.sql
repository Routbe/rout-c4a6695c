-- 0169 — Social accounts claimed by a workspace (Mastodon, Bluesky, …).
-- Separate from social_links so personal and business proofs never mix.
-- Proof = the workspace URL (rout.be/w/<slug>) or its verified domain in the bio.
-- Idempotent.

create table if not exists public.workspace_social_links (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  platform       text not null,
  username       text not null,
  is_verified    boolean not null default false,
  follower_count integer,
  verified_at    timestamptz,
  last_synced_at timestamptz,
  last_error     text,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint workspace_social_links_unique unique (workspace_id, platform),
  constraint workspace_social_links_platform_check check (platform = any (array['x','instagram','tiktok','youtube','github','mastodon','bluesky','wsocial']))
);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.workspace_social_links from rout_app;
    grant select, insert, update, delete on public.workspace_social_links to rout_app;
  end if;
end $$;
revoke all on public.workspace_social_links from public;

alter table public.workspace_social_links enable row level security;
drop policy if exists rout_member_read on public.workspace_social_links;
create policy rout_member_read on public.workspace_social_links
  for select using (public.rout_is_workspace_member(workspace_id));
drop policy if exists rout_editor_write on public.workspace_social_links;
create policy rout_editor_write on public.workspace_social_links
  for all using (public.rout_workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (public.rout_workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
