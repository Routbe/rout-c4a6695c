-- 0155 — Workspace team, hub and conversion access for the rout_app runtime.
-- The generic 0120/0126 policies only let a caller see their own membership and
-- workspaces they already belong to. That blocked creating a workspace, listing a
-- team, accepting invites, converting an account and even reading one's own
-- profile. This adds narrow policies plus SECURITY DEFINER helpers; role
-- decisions stay in the application (workspace-rules.ts). Idempotent.

-- Profiles: owners manage their own row; link-in-bio pages are public, the app redacts private fields.
drop policy if exists rout_owner on public.profiles;
create policy rout_owner on public.profiles
  using (id = public.rout_current_user_id()) with check (id = public.rout_current_user_id());
drop policy if exists rout_public_read on public.profiles;
create policy rout_public_read on public.profiles for select using (true);

-- Personal OAuth apps belong to their owner.
drop policy if exists rout_owner on public.oauth_clients;
create policy rout_owner on public.oauth_clients
  using (owner_user_id = public.rout_current_user_id()) with check (owner_user_id = public.rout_current_user_id());

-- Workspaces: any signed-in caller may create one (the creator is added as owner in the same batch).
drop policy if exists rout_create on public.workspaces;
create policy rout_create on public.workspaces for insert with check (public.rout_current_user_id() is not null);
alter table public.workspaces add column if not exists public_profile jsonb not null default '{}'::jsonb;

create or replace function public.rout_workspace_role(ws uuid) returns text
  language sql stable security definer set search_path = public
  as $$ select role::text from public.workspace_members
        where workspace_id = ws and user_id = public.rout_current_user_id() limit 1 $$;
revoke all on function public.rout_workspace_role(uuid) from public;
grant execute on function public.rout_workspace_role(uuid) to rout_app;
grant execute on function public.rout_is_workspace_member(uuid) to rout_app;

-- Members: colleagues see each other; owners/admins add, change and remove.
drop policy if exists rout_team_read on public.workspace_members;
create policy rout_team_read on public.workspace_members for select using (public.rout_is_workspace_member(workspace_id));
drop policy if exists rout_team_add on public.workspace_members;
create policy rout_team_add on public.workspace_members for insert
  with check (public.rout_workspace_role(workspace_id) in ('owner', 'admin'));
drop policy if exists rout_team_update on public.workspace_members;
create policy rout_team_update on public.workspace_members for update
  using (public.rout_workspace_role(workspace_id) in ('owner', 'admin'))
  with check (public.rout_workspace_role(workspace_id) in ('owner', 'admin'));
drop policy if exists rout_team_remove on public.workspace_members;
create policy rout_team_remove on public.workspace_members for delete
  using (public.rout_workspace_role(workspace_id) in ('owner', 'admin'));

-- Invites can target a ROUT account by @username.
alter table public.workspace_invites add column if not exists invited_user_id uuid references public.users(id) on delete cascade;

-- Accepts the caller's pending invites: by invited account, or by a verified e-mail the server passes in.
create or replace function public.rout_accept_workspace_invites(p_email text) returns integer
  language plpgsql security definer set search_path = public
  as $$
declare uid uuid := public.rout_current_user_id(); n integer := 0;
begin
  if uid is null then return 0; end if;
  with inv as (
    update public.workspace_invites set status = 'accepted'
    where status = 'pending'
      and (invited_user_id = uid or (coalesce(p_email, '') <> '' and invited_user_id is null and lower(email) = lower(p_email)))
    returning workspace_id, role
  )
  insert into public.workspace_members (workspace_id, user_id, role)
  select distinct on (workspace_id) workspace_id, uid, role from inv
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.rout_accept_workspace_invites(text) from public;
grant execute on function public.rout_accept_workspace_invites(text) to rout_app;

-- Resolves an active account by @username or e-mail for invites and owner transfers (server use only).
create or replace function public.rout_resolve_account(p_identifier text) returns table(user_id uuid, email text, username text)
  language sql stable security definer set search_path = public
  as $$
  select u.id, u.email, p.username from public.users u left join public.profiles p on p.id = u.id
  where public.rout_current_user_id() is not null and u.account_status = 'active'
    and (lower(p.username) = lower(ltrim(p_identifier, '@')) or u.email_normalized = lower(p_identifier))
  limit 1 $$;
revoke all on function public.rout_resolve_account(text) from public;
grant execute on function public.rout_resolve_account(text) to rout_app;

-- Team overview with e-mail addresses: owners and admins only.
create or replace function public.rout_workspace_team(p_ws uuid)
  returns table(user_id uuid, role text, created_at timestamptz, email text, username text)
  language sql stable security definer set search_path = public
  as $$
  select m.user_id, m.role::text, m.created_at, u.email, p.username
  from public.workspace_members m
  left join public.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.workspace_id = p_ws and public.rout_workspace_role(p_ws) in ('owner', 'admin')
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'developer' then 2 else 3 end, m.created_at
  limit 200 $$;
revoke all on function public.rout_workspace_team(uuid) from public;
grant execute on function public.rout_workspace_team(uuid) to rout_app;

create or replace function public.rout_workspace_slug_taken(p_slug text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.workspaces where slug = lower(p_slug)) $$;
revoke all on function public.rout_workspace_slug_taken(text) from public;
grant execute on function public.rout_workspace_slug_taken(text) to rout_app;

-- Public card + published hub for rout.be/w/<slug>; never billing, VAT or Stripe fields.
create or replace function public.rout_public_workspace(p_slug text)
  returns table(name text, slug text, avatar_url text, description text, domain text, profile_handle text, public_profile jsonb)
  language sql stable security definer set search_path = public
  as $$
  select w.name, w.slug, w.avatar_url, w.description,
         case when w.domain_verified_at is not null then w.domain end,
         (select p.username from public.profiles p
           where p.workspace_id = w.id and coalesce((p.display_prefs->>'publicProfile')::boolean, true)
           order by p.created_at limit 1),
         case when coalesce((w.public_profile->>'published')::boolean, false) then w.public_profile else '{}'::jsonb end
  from public.workspaces w where w.slug = lower(p_slug) limit 1 $$;
revoke all on function public.rout_public_workspace(text) from public;
grant execute on function public.rout_public_workspace(text) to rout_app;

-- Transfers: both parties see their transfer; wizard answers travel with it.
alter table public.workspace_transfers add column if not exists details jsonb not null default '{}'::jsonb;
drop policy if exists rout_transfer_party on public.workspace_transfers;
create policy rout_transfer_party on public.workspace_transfers
  using (source_user_id = public.rout_current_user_id() or target_user_id = public.rout_current_user_id())
  with check (source_user_id = public.rout_current_user_id() or target_user_id = public.rout_current_user_id());

create or replace function public.rout_transfer_by_token(p_hash text) returns setof public.workspace_transfers
  language sql stable security definer set search_path = public
  as $$ select * from public.workspace_transfers where token_hash = p_hash limit 1 $$;
revoke all on function public.rout_transfer_by_token(text) from public;
grant execute on function public.rout_transfer_by_token(text) to rout_app;

create or replace function public.rout_transfers_for_email(p_email text) returns table(id uuid, source_user_id uuid)
  language sql stable security definer set search_path = public
  as $$ select t.id, t.source_user_id from public.workspace_transfers t
        where lower(t.target_email) = lower(p_email) and t.target_user_id is null
          and t.status in ('pending', 'otp_ok') and t.expires_at > now()
          and t.source_user_id <> public.rout_current_user_id() $$;
revoke all on function public.rout_transfers_for_email(text) from public;
grant execute on function public.rout_transfers_for_email(text) to rout_app;

-- Sunset scrubber (cron, no signed-in caller) finds logins whose 30 days are over.
create or replace function public.rout_due_sunset_accounts() returns table(id uuid, ba text)
  language sql stable security definer set search_path = public
  as $$ select u.id, u.user_metadata->>'neon_auth_id' from public.users u
        where u.account_status = 'migrated_sunset' and u.sunset_at < now() limit 200 $$;
revoke all on function public.rout_due_sunset_accounts() from public;
grant execute on function public.rout_due_sunset_accounts() to rout_app;

-- Grace period: converted logins keep working as workspace admin until their sunset date.
insert into public.workspace_members (workspace_id, user_id, role)
select u.migrated_to_workspace_id, u.id, 'admin'
from public.users u
where u.account_status = 'migrated_sunset' and u.sunset_at > now() and u.migrated_to_workspace_id is not null
on conflict do nothing;
