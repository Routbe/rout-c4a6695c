-- 0171 — Workspace Bluesky handles (<slug>.w.rout.be or <domain>.rout.be) and
-- public rel="me" links for Mastodon/GitHub verification. Idempotent.

alter table public.workspaces add column if not exists bluesky_did text;
alter table public.workspaces add column if not exists bluesky_handle text;
do $$ begin
  alter table public.workspaces add constraint workspaces_bluesky_did_check
    check (bluesky_did is null or bluesky_did ~ '^did:(plc|web):[a-zA-Z0-9._:%-]{1,200}$');
exception when duplicate_object then null; end $$;

-- DID for the AT Protocol well-known file. Lookup by slug (<slug>.w.rout.be)
-- or by verified domain (<domain>.rout.be). Returns only the public DID.
create or replace function public.rout_workspace_atproto_did(p_slug text, p_domain text)
returns text
language sql stable security definer set search_path = public
as $$
  select w.bluesky_did from public.workspaces w
   where (p_slug is not null and w.slug = lower(p_slug))
      or (p_domain is not null and w.domain_verified_at is not null and lower(w.domain) = lower(p_domain))
   limit 1
$$;

-- Slug for a verified workspace domain, used to serve <domain>.rout.be.
create or replace function public.rout_workspace_slug_for_domain(p_domain text)
returns text
language sql stable security definer set search_path = public
as $$
  select w.slug from public.workspaces w
   where w.domain_verified_at is not null and lower(w.domain) = lower(p_domain)
   limit 1
$$;

-- Mastodon/GitHub accounts a workspace lists, for rel="me" on its public page.
-- These are the workspace's own claims; Mastodon verifies the other direction.
create or replace function public.rout_public_workspace_relme(p_slug text)
returns table(platform text, username text)
language sql stable security definer set search_path = public
as $$
  select s.platform, s.username
    from public.workspace_social_links s
    join public.workspaces w on w.id = s.workspace_id
   where w.slug = lower(p_slug) and s.platform in ('mastodon', 'github')
$$;

revoke all on function public.rout_workspace_atproto_did(text, text) from public;
revoke all on function public.rout_workspace_slug_for_domain(text) from public;
revoke all on function public.rout_public_workspace_relme(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_workspace_atproto_did(text, text) to rout_app;
    grant execute on function public.rout_workspace_slug_for_domain(text) to rout_app;
    grant execute on function public.rout_public_workspace_relme(text) to rout_app;
  end if;
end $$;
