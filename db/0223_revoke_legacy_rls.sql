-- 0223: revoke legacy "rout_server" free-access policies, phase 1.
--
-- db/0154 gave rout_app a `using (true) with check (true)` policy on every
-- server-only table that had no policy yet. On a fresh replay the merge
-- executor policies of 0152 already existed, so the schema model never had
-- them; on the live database 23 tables still do. All 23 are read or written by
-- running code, most outside the member's own context (OAuth token exchange,
-- payment webhooks, cron, admin screens, pre-login checks). Dropping them all at
-- once would stop sign-in, payments and administration.
--
-- This phase removes free access only where the code proves it is not needed:
--   * oauth_step_up_challenges, oauth_step_up_codes, user_sessions — every
--     access runs in the owner's own context (the vault export now does too),
--     so they become owner-only, plus deletion by the account purge for an
--     account whose deletion is genuinely due (checked in the database).
--   * analytics_events, profile_ingest_tokens — no runtime access at all:
--     rout_app loses every privilege. (execute_account_merge is SECURITY DEFINER
--     and keeps working.)
-- The remaining 18 tables move to narrow SECURITY DEFINER functions in later
-- phases, one feature at a time; their policies are untouched here.

-- True only inside the account purge transaction for an account whose
-- deletion request is open and past purge_after (same rule as 0148/0151).
create or replace function public.rout_purge_due(p_user uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select p_user is not null
     and pg_catalog.current_setting('rout.purge_user_id', true) = p_user::text
     and exists (select 1 from public.account_deletions d
                  where d.user_id = p_user and d.cancelled_at is null and d.completed_at is null
                    and d.purge_after <= pg_catalog.now())
$$;
revoke all on function public.rout_purge_due(uuid) from public;
grant execute on function public.rout_purge_due(uuid) to rout_app;

do $$
declare t text;
begin
  foreach t in array array['oauth_step_up_challenges', 'oauth_step_up_codes', 'user_sessions'] loop
    execute format('drop policy if exists rout_server on public.%I', t);
    execute format('drop policy if exists rout_owner on public.%I', t);
    execute format($p$create policy rout_owner on public.%I to rout_app
      using ((user_id)::text = current_setting('rout.current_user_id', true) or public.rout_purge_due(user_id))
      with check ((user_id)::text = current_setting('rout.current_user_id', true))$p$, t);
  end loop;
  foreach t in array array['analytics_events', 'profile_ingest_tokens'] loop
    execute format('drop policy if exists rout_server on public.%I', t);
    execute format('revoke all on table public.%I from rout_app', t);
  end loop;
end $$;
