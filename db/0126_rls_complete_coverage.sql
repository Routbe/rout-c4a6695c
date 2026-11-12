-- Completes RLS coverage: every public table has RLS on. Tables without a
-- policy are server-only (deny by default for rout_app once BYPASSRLS is off).
-- Policies follow db/0120: owner = rout_current_user_id() (from rout.user_id),
-- workspace rows only through verified membership; rout.workspace_id is never trusted.
do $$
declare t text;
begin
  foreach t in array array[
    'account_merge_tickets','admin_bootstrap_tokens','altcha_used','ambient_weather_cache',
    'badge_claim_links','calendar_events','creator_donations','credential_issue_requests',
    'credential_issuer_blocks','didit_monthly_usage','entitlement_overrides','fediverse_email_otp',
    'identity_labels','login_codes','oauth_client_test_users','oauth_client_verification_requests',
    'oauth_debug_events','oauth_signing_keys','onboarding_drafts','pricing_settings',
    'profile_link_clicks','qr_scans','rate_limits','referrals','schema_migrations',
    'social_block_settings','telegram_verify_sessions','users','workspaces'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

drop policy if exists rout_scope on public.users;
create policy rout_scope on public.users
  using (id = public.rout_current_user_id()) with check (id = public.rout_current_user_id());

drop policy if exists rout_scope on public.workspaces;
create policy rout_scope on public.workspaces
  using (public.rout_is_workspace_member(id)) with check (public.rout_is_workspace_member(id));

drop policy if exists rout_scope on public.badge_claim_links;
create policy rout_scope on public.badge_claim_links
  using (created_by = public.rout_current_user_id()) with check (created_by = public.rout_current_user_id());

drop policy if exists rout_scope on public.creator_donations;
create policy rout_scope on public.creator_donations
  using (creator_id = public.rout_current_user_id()) with check (creator_id = public.rout_current_user_id());

drop policy if exists rout_scope on public.social_block_settings;
create policy rout_scope on public.social_block_settings
  using (profile_id = public.rout_current_user_id()) with check (profile_id = public.rout_current_user_id());
